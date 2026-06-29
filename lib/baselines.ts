/**
 * Experiment harness — three-way baselines. Reader side (the dashboard chart) plus
 * the daily snapshot writer used by the cron. The whole point of the experiment:
 * does Claude's deep reasoning beat a dumb mechanical version of the same signal?
 *
 *   LLM    — the actual LLM-driven portfolio NAV
 *   SPY    — buy-and-hold of the same starting capital
 *   naive  — top-tercile equal-weight convergence basket (every liquidity-passing
 *            candidate, equal weight, no LLM)
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { baselines, meta, scoredCandidates } from "./schema";
import { accountFor, getRunConfig } from "./config";
import { getNav, PAPER_STARTING_CAPITAL } from "./book";
import { getLastClose, getLastCloses } from "./quotes";

export interface BaselinePoint {
  date: string;
  llm: number;
  spy: number;
  naive: number;
}

export interface BaselineView {
  series: BaselinePoint[];
  hasData: boolean;
  startingCapital: number;
  returns: { llm: number | null; spy: number | null; naive: number | null };
  vsSpy: number | null; // llm return − spy return
}

export async function getBaselineView(): Promise<BaselineView> {
  const cfg = await getRunConfig();
  const account = accountFor(cfg);
  let rows: (typeof baselines.$inferSelect)[] = [];
  try {
    rows = await db
      .select()
      .from(baselines)
      .where(eq(baselines.account, account))
      .orderBy(asc(baselines.date));
  } catch {
    rows = [];
  }
  const series: BaselinePoint[] = rows.map((r) => ({
    date: r.date,
    llm: Number(r.llmNav.toFixed(2)),
    spy: Number(r.spyNav.toFixed(2)),
    naive: Number(r.naiveNav.toFixed(2)),
  }));
  const ret = (first?: number, last?: number) => (first && last && first > 0 ? last / first - 1 : null);
  const f = series[0];
  const l = series[series.length - 1];
  const llmRet = ret(f?.llm, l?.llm);
  const spyRet = ret(f?.spy, l?.spy);
  const naiveRet = ret(f?.naive, l?.naive);
  return {
    series,
    hasData: series.length > 0,
    startingCapital: PAPER_STARTING_CAPITAL,
    returns: { llm: llmRet, spy: spyRet, naive: naiveRet },
    vsSpy: llmRet != null && spyRet != null ? llmRet - spyRet : null,
  };
}

// ── writer: snapshot the three NAVs for today ─────────────────────────────────
export interface BaselineSnapshotResult {
  date: string;
  llm: number;
  spy: number;
  naive: number;
}

export async function runBaselines(): Promise<BaselineSnapshotResult> {
  const cfg = await getRunConfig();
  const account = accountFor(cfg);
  const today = new Date().toISOString().slice(0, 10);

  // (a) LLM portfolio NAV — live-marked book.
  const llm = await getNav(cfg);

  // (b) SPY buy-and-hold. Anchor SPY units once (first snapshot), persisted in meta,
  // so every later mark is a true same-cash benchmark.
  const spyClose = (await getLastClose("SPY")).price || 1;
  const spyUnits = await anchorOr(`bl_spy_units_${account}`, () => PAPER_STARTING_CAPITAL / spyClose);
  const spy = spyUnits * spyClose;

  // (c) Naive top-tercile equal-weight basket: equal dollar weight across every
  // liquidity-passing convergence candidate from the latest run, bought once at the
  // first snapshot (shares persisted in meta), then marked forward. No LLM, no rebalance.
  const naive = await naiveBasketNav(account);

  await db
    .insert(baselines)
    .values({ date: today, account, llmNav: round(llm), spyNav: round(spy), naiveNav: round(naive) })
    .onConflictDoUpdate({
      target: [baselines.date, baselines.account],
      set: { llmNav: round(llm), spyNav: round(spy), naiveNav: round(naive) },
    });

  return { date: today, llm: round(llm), spy: round(spy), naive: round(naive) };
}

/** Read a numeric anchor from meta, or compute+persist it the first time. */
async function anchorOr(key: string, compute: () => number): Promise<number> {
  try {
    const [row] = await db.select().from(meta).where(eq(meta.key, key)).limit(1);
    if (row) return Number(row.value);
  } catch {
    /* fall through */
  }
  const v = compute();
  try {
    await db
      .insert(meta)
      .values({ key, value: String(v), updatedAt: new Date() })
      .onConflictDoNothing({ target: meta.key });
  } catch {
    /* best-effort */
  }
  return v;
}

async function naiveBasketNav(account: string): Promise<number> {
  // Anchor the basket (ticker → shares) once, in meta. Subsequent runs just mark it.
  const key = `bl_naive_basket_${account}`;
  let basket: Record<string, number> | null = null;
  try {
    const [row] = await db.select().from(meta).where(eq(meta.key, key)).limit(1);
    if (row) basket = JSON.parse(row.value) as Record<string, number>;
  } catch {
    /* none yet */
  }

  if (!basket) {
    // Build the basket from the latest run's liquidity-passing candidates.
    try {
      const [latest] = await db
        .select({ runId: scoredCandidates.runId })
        .from(scoredCandidates)
        .orderBy(sql`${scoredCandidates.createdAt} desc`)
        .limit(1);
      if (!latest?.runId) return PAPER_STARTING_CAPITAL;
      const rows = await db
        .select()
        .from(scoredCandidates)
        .where(and(eq(scoredCandidates.runId, latest.runId), eq(scoredCandidates.liquidityOk, true)));
      if (rows.length === 0) return PAPER_STARTING_CAPITAL;
      const tickers = rows.map((r) => r.ticker);
      const quotes = await getLastCloses(tickers);
      const perName = PAPER_STARTING_CAPITAL / tickers.length;
      basket = {};
      for (const t of tickers) {
        const px = quotes[t]?.price ?? 0;
        basket[t] = px > 0 ? perName / px : 0;
      }
      await db
        .insert(meta)
        .values({ key, value: JSON.stringify(basket), updatedAt: new Date() })
        .onConflictDoNothing({ target: meta.key });
    } catch {
      return PAPER_STARTING_CAPITAL;
    }
  }

  const tickers = Object.keys(basket);
  if (tickers.length === 0) return PAPER_STARTING_CAPITAL;
  const quotes = await getLastCloses(tickers);
  let nav = 0;
  for (const t of tickers) nav += basket[t] * (quotes[t]?.price ?? 0);
  return nav || PAPER_STARTING_CAPITAL;
}

const round = (n: number) => Number(n.toFixed(2));
