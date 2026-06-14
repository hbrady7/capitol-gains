/**
 * Scoreboard data — the honesty layer. Equity vs an SPY buy-and-hold of the same
 * cash over the same dates, plus blunt stats. Built from what Claude Code records
 * (account_snapshots, benchmark_snapshots, trades/paper_trades). Empty until the
 * executor has run — the page handles that gracefully.
 */
import { asc, sql } from "drizzle-orm";
import { db } from "./db";
import { accountSnapshots, benchmarkSnapshots, paperTrades, trades } from "./schema";
import { getConfig } from "./settings";

export interface ScorePoint {
  date: string;
  strategy: number;
  spy: number | null;
}

export interface Scoreboard {
  series: ScorePoint[];
  hasData: boolean;
  paperMode: boolean;
  vsSpyPct: number | null; // strategy return - spy return
  strategyReturnPct: number | null;
  spyReturnPct: number | null;
  winRate: number | null;
  avgHoldDays: number | null;
  maxDrawdownPct: number | null;
  exposurePct: number | null;
  tradeCount: number;
}

export async function getScoreboard(): Promise<Scoreboard> {
  const cfg = await getConfig();
  const account = cfg.paperMode ? "paper" : "live";
  let snaps: typeof accountSnapshots.$inferSelect[] = [];
  let bench: typeof benchmarkSnapshots.$inferSelect[] = [];
  try {
    snaps = await db.select().from(accountSnapshots).where(sql`account = ${account}`).orderBy(asc(accountSnapshots.date));
    bench = await db.select().from(benchmarkSnapshots).where(sql`account = ${account}`).orderBy(asc(benchmarkSnapshots.date));
  } catch {
    /* tables empty */
  }

  const benchMap = new Map(bench.map((b) => [b.date, b.spyEquity]));
  const series: ScorePoint[] = snaps.map((s) => ({
    date: s.date,
    strategy: s.accountValue,
    spy: benchMap.get(s.date) ?? null,
  }));

  // Win rate / hold / exposure from recorded fills.
  const table = cfg.paperMode ? paperTrades : trades;
  let fills: { ticker: string; side: string; qty: number; price: number | null; ts: Date }[] = [];
  try {
    const rows = await db.select().from(table);
    fills = rows.map((r) => ({
      ticker: r.ticker,
      side: r.side,
      qty: r.qty,
      price: cfg.paperMode ? (r as typeof paperTrades.$inferSelect).simPrice : (r as typeof trades.$inferSelect).fillPrice,
      ts: (r as { ts: Date }).ts,
    }));
  } catch {
    fills = [];
  }

  const { winRate, avgHoldDays } = realizedStats(fills);
  const maxDd = series.length ? maxDrawdown(series.map((p) => p.strategy)) : null;

  const first = series[0];
  const last = series[series.length - 1];
  const stratRet = first && last && first.strategy > 0 ? last.strategy / first.strategy - 1 : null;
  const firstSpy = series.find((p) => p.spy != null)?.spy ?? null;
  const lastSpy = [...series].reverse().find((p) => p.spy != null)?.spy ?? null;
  const spyRet = firstSpy && lastSpy && firstSpy > 0 ? lastSpy / firstSpy - 1 : null;

  return {
    series,
    hasData: series.length > 0,
    paperMode: cfg.paperMode,
    vsSpyPct: stratRet != null && spyRet != null ? stratRet - spyRet : null,
    strategyReturnPct: stratRet,
    spyReturnPct: spyRet,
    winRate,
    avgHoldDays,
    maxDrawdownPct: maxDd,
    exposurePct: last && last.strategy > 0 ? null : null, // filled by caller if positions known
    tradeCount: fills.length,
  };
}

function realizedStats(fills: { ticker: string; side: string; qty: number; price: number | null; ts: Date }[]) {
  // FIFO match buys to sells per ticker to get closed-trade outcomes + hold days.
  const byTicker = new Map<string, typeof fills>();
  for (const f of fills) {
    if (!byTicker.has(f.ticker)) byTicker.set(f.ticker, []);
    byTicker.get(f.ticker)!.push(f);
  }
  let wins = 0;
  let closed = 0;
  let holdSum = 0;
  for (const [, list] of byTicker) {
    const buys = list.filter((f) => f.side === "buy").sort((a, b) => +a.ts - +b.ts);
    const sells = list.filter((f) => f.side === "sell").sort((a, b) => +a.ts - +b.ts);
    let bi = 0;
    for (const sell of sells) {
      const buy = buys[bi++];
      if (!buy) break;
      closed++;
      if ((sell.price ?? 0) > (buy.price ?? 0)) wins++;
      holdSum += Math.max(0, Math.round((+sell.ts - +buy.ts) / 86400000));
    }
  }
  return {
    winRate: closed > 0 ? wins / closed : null,
    avgHoldDays: closed > 0 ? Math.round(holdSum / closed) : null,
  };
}

function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let dd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) dd = Math.max(dd, (peak - v) / peak);
  }
  return dd;
}
