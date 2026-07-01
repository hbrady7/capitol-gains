/**
 * Replay / backtest harness — measure a strategy change BEFORE it touches the live
 * loop. It replays a history of disclosures day-by-day through the EXACT SAME pure
 * functions the autonomous loop uses (`scoreCandidates` + `computeExitSignals`), with
 * a deterministic decision policy standing in for the LLM (buy the top fresh
 * convergent name, size by CCS within the caps; exit by the same rules). It tracks
 * the strategy NAV against SPY buy-and-hold and the naive equal-weight basket.
 *
 * Everything is PURE and in-memory — it never reads or writes the live DB — so it is
 * safe to run anywhere and is exercised by the smoke test. Feed it real historical
 * rows later; the synthetic generator here just makes it self-contained offline.
 */
import { scoreCandidates, type CongBuy, type InsBuy, type ScoringCfg } from "./scoring";
import { computeExitSignals, hasProtective, type ExitPolicy } from "./exits";
import type { InsiderRoleValue } from "./roles";

export interface BacktestConfig {
  scoring: ScoringCfg;
  exits: ExitPolicy;
  maxPerPosition: number;
  maxOpenPositions: number;
  startingCapital: number;
  days: number; // trading days to simulate
}

export interface BacktestPoint {
  day: number;
  date: string;
  strategy: number;
  spy: number;
  naive: number;
}

export interface BacktestResult {
  series: BacktestPoint[];
  metrics: {
    strategyReturn: number;
    spyReturn: number;
    naiveReturn: number;
    vsSpy: number;
    vsNaive: number;
    maxDrawdownPct: number;
    trades: number;
    exits: number;
    winRatePct: number | null;
  };
}

export interface BacktestWorld {
  tickers: string[];
  priceOn: (ticker: string, day: number) => number;
  congOn: (day: number) => CongBuy[]; // disclosures on that day
  insOn: (day: number) => InsBuy[];
  spyOn: (day: number) => number;
  dateOf: (day: number) => string;
}

interface Lot {
  ticker: string;
  qty: number;
  avgPrice: number;
  peak: number;
  openedDay: number;
}

export function runBacktest(world: BacktestWorld, cfg: BacktestConfig): BacktestResult {
  let cash = cfg.startingCapital;
  const lots = new Map<string, Lot>();
  const series: BacktestPoint[] = [];
  let trades = 0;
  let exits = 0;
  let wins = 0;
  let closed = 0;
  let peakNav = cfg.startingCapital;
  let maxDd = 0;

  // Naive basket + SPY anchored on day 0.
  const spy0 = world.spyOn(0) || 1;
  const spyUnits = cfg.startingCapital / spy0;
  let naiveBasket: Record<string, number> | null = null;

  // Rolling window of disclosures.
  const congWindow: CongBuy[] = [];
  const insWindow: InsBuy[] = [];

  for (let day = 0; day < cfg.days; day++) {
    const date = world.dateOf(day);
    congWindow.push(...world.congOn(day));
    insWindow.push(...world.insOn(day));
    // Trim to the lookback + freshness horizon to keep it bounded.
    const horizon = cfg.scoring.lookbackDays + cfg.scoring.freshnessCutoffDays + 5;
    prune(congWindow, (b) => b.disclosureDate, date, horizon);
    prune(insWindow, (b) => b.filingDate, date, horizon);

    const scored = scoreCandidates({ congBuys: congWindow, insBuys: insWindow, cfg: cfg.scoring, today: date });

    // ── exits first (same rules as live) ──
    for (const [ticker, lot] of [...lots]) {
      const last = world.priceOn(ticker, day);
      lot.peak = Math.max(lot.peak, last);
      const onList = scored.some((c) => c.ticker === ticker);
      const triggers = computeExitSignals(
        { ticker, qty: lot.qty, avgPrice: lot.avgPrice, peakPrice: lot.peak, lastPrice: last, openedAt: world.dateOf(lot.openedDay) },
        cfg.exits,
        { offCandidateList: !onList, congressSelling: false, insiderSelling: false, refutingCatalyst: false },
        date,
      );
      // Deterministic policy: exit on any protective trigger OR loss of thesis (off-list).
      if (triggers.length && (hasProtective(triggers) || !onList)) {
        const proceeds = lot.qty * last;
        cash += proceeds;
        closed++;
        if (proceeds > lot.qty * lot.avgPrice) wins++;
        lots.delete(ticker);
        exits++;
      }
    }

    // ── one entry per day (top fresh convergent name not held) ──
    const pick = scored.find((c) => c.congNorm > 0 && c.insNorm > 0 && !lots.has(c.ticker)) ?? scored.find((c) => !lots.has(c.ticker));
    if (pick && lots.size < cfg.maxOpenPositions) {
      // Size by CCS (proxy for conviction), within the per-position cap and cash.
      const convictionFrac = Math.max(0.25, Math.min(1, pick.ccs / 3));
      const dollars = Math.min(cfg.maxPerPosition * convictionFrac, cfg.maxPerPosition, cash);
      const px = world.priceOn(pick.ticker, day);
      if (dollars > 1 && px > 0) {
        const qty = dollars / px;
        cash -= qty * px;
        lots.set(pick.ticker, { ticker: pick.ticker, qty, avgPrice: px, peak: px, openedDay: day });
        trades++;
      }
    }

    // Anchor the naive basket once there are liquidity-passing candidates.
    if (!naiveBasket && scored.length > 0) {
      naiveBasket = {};
      const per = cfg.startingCapital / scored.length;
      for (const c of scored) {
        const px = world.priceOn(c.ticker, day);
        naiveBasket[c.ticker] = px > 0 ? per / px : 0;
      }
    }

    // Mark NAVs.
    let mv = 0;
    for (const [ticker, lot] of lots) mv += lot.qty * world.priceOn(ticker, day);
    const strategy = cash + mv;
    const spy = spyUnits * world.spyOn(day);
    let naive = cfg.startingCapital;
    if (naiveBasket) {
      naive = 0;
      for (const t of Object.keys(naiveBasket)) naive += naiveBasket[t] * world.priceOn(t, day);
    }
    peakNav = Math.max(peakNav, strategy);
    maxDd = Math.max(maxDd, peakNav > 0 ? (peakNav - strategy) / peakNav : 0);
    series.push({ day, date, strategy: r2(strategy), spy: r2(spy), naive: r2(naive) });
  }

  const first = series[0];
  const lastPt = series[series.length - 1];
  const ret = (a?: number, b?: number) => (a && b && a > 0 ? b / a - 1 : 0);
  const strategyReturn = ret(cfg.startingCapital, lastPt?.strategy);
  const spyReturn = ret(first?.spy, lastPt?.spy);
  const naiveReturn = ret(first?.naive, lastPt?.naive);
  return {
    series,
    metrics: {
      strategyReturn: r4(strategyReturn),
      spyReturn: r4(spyReturn),
      naiveReturn: r4(naiveReturn),
      vsSpy: r4(strategyReturn - spyReturn),
      vsNaive: r4(strategyReturn - naiveReturn),
      maxDrawdownPct: r2(maxDd * 100),
      trades,
      exits,
      winRatePct: closed > 0 ? r2((wins / closed) * 100) : null,
    },
  };
}

function prune<T>(arr: T[], dateOf: (t: T) => string, today: string, horizonDays: number): void {
  const cutoff = Date.parse(`${today}T00:00:00Z`) - horizonDays * 86400000;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Date.parse(`${dateOf(arr[i])}T00:00:00Z`) < cutoff) arr.splice(i, 1);
  }
}

const r2 = (n: number) => Number(n.toFixed(2));
const r4 = (n: number) => Number(n.toFixed(4));

// ── self-contained synthetic world (deterministic; swap for real rows later) ────
export function makeSyntheticWorld(opts?: { seed?: number; days?: number }): BacktestWorld {
  const days = opts?.days ?? 120;
  const tickers = ["NVDA", "AAPL", "MSFT", "AMZN", "LLY", "CRWD", "PANW", "AVGO"];
  const members = ["Tommy Tuberville", "Nancy Pelosi", "Ro Khanna", "Dan Crenshaw", "Josh Gottheimer"];
  const insiders: { name: string; role: InsiderRoleValue }[] = [
    { name: "Jensen Huang", role: "ceo" },
    { name: "Tim Cook", role: "ceo" },
    { name: "A Board Director", role: "director" },
  ];
  const rand = lcg(opts?.seed ?? 7);

  // Deterministic per-ticker price paths (gentle drift + noise), plus SPY.
  const base: Record<string, number> = {};
  const drift: Record<string, number> = {};
  for (const t of tickers) {
    base[t] = 40 + rand() * 400;
    drift[t] = (rand() - 0.45) * 0.004; // slight positive tilt on average
  }
  const noise = (t: string, day: number) => Math.sin((day + t.length) * 0.7) * 0.02;
  const priceOn = (t: string, day: number) => Number((base[t] * Math.exp(drift[t] * day + noise(t, day))).toFixed(2));
  const spyBase = 400;
  const spyOn = (day: number) => Number((spyBase * Math.exp(0.0006 * day)).toFixed(2));

  const start = Date.parse("2026-01-02T00:00:00Z");
  const dateOf = (day: number) => new Date(start + day * 86400000).toISOString().slice(0, 10);

  // Pre-generate disclosure events so congOn/insOn are stable per day.
  const congByDay: Record<number, CongBuy[]> = {};
  const insByDay: Record<number, InsBuy[]> = {};
  for (let day = 0; day < days; day++) {
    congByDay[day] = [];
    insByDay[day] = [];
    // ~35% of days have a congressional disclosure (with a stale lag).
    if (rand() < 0.35) {
      const t = tickers[Math.floor(rand() * tickers.length)];
      const lag = 10 + Math.floor(rand() * 25);
      const tx = dateOf(Math.max(0, day - lag));
      const lo = [1001, 15001, 50001, 100001, 250001][Math.floor(rand() * 5)];
      congByDay[day].push({
        ticker: t,
        member: members[Math.floor(rand() * members.length)],
        amountLow: lo,
        amountHigh: lo * 2,
        transactionDate: tx,
        disclosureDate: dateOf(day),
        daysStale: lag,
        histReturn: -0.05 + rand() * 0.2,
      });
    }
    // ~30% of days have an insider Form 4 (short lag). Overlap tickers → convergence.
    if (rand() < 0.3) {
      const t = tickers[Math.floor(rand() * tickers.length)];
      const ins = insiders[Math.floor(rand() * insiders.length)];
      const lag = 1 + Math.floor(rand() * 3);
      insByDay[day].push({
        ticker: t,
        insiderName: ins.name,
        role: ins.role,
        dollarValue: 50_000 + rand() * 2_000_000,
        transactionDate: dateOf(Math.max(0, day - lag)),
        filingDate: dateOf(day),
        daysStale: lag,
      });
    }
  }

  return {
    tickers,
    priceOn,
    spyOn,
    dateOf,
    congOn: (day) => congByDay[day] ?? [],
    insOn: (day) => insByDay[day] ?? [],
  };
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff);
}

/** Convenience: run the built-in synthetic backtest with sensible defaults. */
export function runSyntheticBacktest(overrides?: Partial<BacktestConfig> & { seed?: number; days?: number }): BacktestResult {
  const days = overrides?.days ?? 120;
  const world = makeSyntheticWorld({ seed: overrides?.seed, days });
  const cfg: BacktestConfig = {
    scoring: { lookbackDays: 45, wCong: 1, wIns: 1, kConverge: 1.5, freshnessCutoffDays: 21, minDollarVolume: 5_000_000 },
    exits: { trailingStopPct: 20, hardStopPct: 25, takeProfitPct: 0, maxHoldDays: 90 },
    maxPerPosition: 100,
    maxOpenPositions: 10,
    startingCapital: 1000,
    days,
    ...overrides,
  };
  return runBacktest(world, cfg);
}
