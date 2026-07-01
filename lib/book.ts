/**
 * The book — positions, cash, and exposure, read from the `positions` and `fills`
 * tables the execution adapter maintains. Shared by the decision brain (context),
 * the compliance desk (cap checks), and the experiment harness (NAV).
 *
 * Paper mode runs against a notional starting capital so the experiment has a
 * stable denominator; live mode would read the broker, but the app itself never
 * calls the broker — the executor records fills and we read them here.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { fills, meta, positions } from "./schema";
import { accountFor, type RunConfig } from "./config";
import { getLastCloses } from "./quotes";

/** Notional paper capital — caps imply ~10 × $100; give a little headroom. */
export const PAPER_STARTING_CAPITAL = 1000;

export type Position = typeof positions.$inferSelect;

export async function getOpenPositions(cfg: Pick<RunConfig, "paperMode">): Promise<Position[]> {
  const account = accountFor(cfg);
  try {
    return await db
      .select()
      .from(positions)
      .where(and(eq(positions.account, account), sql`${positions.qty} > 0.000001`));
  } catch {
    return [];
  }
}

/** Cost basis currently deployed across open positions. */
export async function getDeployedCost(cfg: Pick<RunConfig, "paperMode">): Promise<number> {
  const pos = await getOpenPositions(cfg);
  return pos.reduce((s, p) => s + p.qty * p.avgPrice, 0);
}

/** Net buy/sell cash flow from the fills ledger: Σ sell dollars − Σ buy dollars.
 *  With no sells this equals −Σ(buy cost) — identical to the old cost-basis model —
 *  but once the exit desk sells, realized P&L flows back into cash correctly. */
async function getNetCashFlow(cfg: Pick<RunConfig, "paperMode">): Promise<number> {
  const account = accountFor(cfg);
  try {
    const [row] = await db
      .select({
        f: sql<number>`coalesce(sum(case when ${fills.side} = 'sell' then ${fills.dollars} else -${fills.dollars} end), 0)`,
      })
      .from(fills)
      .where(eq(fills.account, account));
    return Number(row?.f ?? 0);
  } catch {
    return 0;
  }
}

/** Available cash = starting capital + net cash flow (sells add, buys subtract).
 *  Never negative. This is the true cash-flow model, so realized gains are spendable. */
export async function getAvailableCash(cfg: Pick<RunConfig, "paperMode">): Promise<number> {
  const flow = await getNetCashFlow(cfg);
  return Math.max(0, PAPER_STARTING_CAPITAL + flow);
}

/** Cumulative realized P&L booked on sells (from the fills ledger). */
export async function getRealizedPnl(cfg: Pick<RunConfig, "paperMode">): Promise<number> {
  const account = accountFor(cfg);
  try {
    const [row] = await db
      .select({ r: sql<number>`coalesce(sum(${fills.realizedPnl}), 0)` })
      .from(fills)
      .where(and(eq(fills.account, account), eq(fills.side, "sell")));
    return Number(row?.r ?? 0);
  } catch {
    return 0;
  }
}

/** Dollars filled (buys) since UTC midnight today — for the per-day cap. */
export async function getSpentToday(cfg: Pick<RunConfig, "paperMode">): Promise<number> {
  const account = accountFor(cfg);
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  try {
    const [row] = await db
      .select({ s: sql<number>`coalesce(sum(${fills.dollars}), 0)` })
      .from(fills)
      .where(and(eq(fills.account, account), eq(fills.side, "buy"), gte(fills.ts, midnight)));
    return Number(row?.s ?? 0);
  } catch {
    return 0;
  }
}

/** Advance every open position's trailing high-water mark to the latest price.
 *  Called by the marks step so the exit desk's trailing stop has fresh peaks.
 *  Returns the marks it applied. Best-effort; never throws. */
export async function markPositions(
  cfg: Pick<RunConfig, "paperMode">,
): Promise<{ ticker: string; last: number; peak: number }[]> {
  const pos = await getOpenPositions(cfg);
  if (pos.length === 0) return [];
  const quotes = await getLastCloses(pos.map((p) => p.ticker));
  const out: { ticker: string; last: number; peak: number }[] = [];
  for (const p of pos) {
    const last = quotes[p.ticker]?.price ?? p.avgPrice;
    const prevPeak = p.peakPrice ?? p.avgPrice;
    const peak = Math.max(prevPeak, last);
    out.push({ ticker: p.ticker, last, peak });
    if (peak > prevPeak) {
      try {
        await db
          .update(positions)
          .set({ peakPrice: peak, updatedAt: new Date() })
          .where(eq(positions.id, p.id));
      } catch {
        /* best-effort */
      }
    }
  }
  return out;
}

/** Live-marked NAV of the book (cash + market value of positions). */
export async function getNav(cfg: Pick<RunConfig, "paperMode">): Promise<number> {
  const pos = await getOpenPositions(cfg);
  const cash = await getAvailableCash(cfg);
  if (pos.length === 0) return cash;
  const quotes = await getLastCloses(pos.map((p) => p.ticker));
  const mv = pos.reduce((s, p) => s + p.qty * (quotes[p.ticker]?.price ?? p.avgPrice), 0);
  return cash + mv;
}

/** High-water mark for the drawdown breaker. Reads the stored HWM, advances it if
 *  `currentNav` is a new high (persisting it), and returns the effective HWM. */
export async function getHighWaterMark(
  cfg: Pick<RunConfig, "paperMode">,
  currentNav: number,
): Promise<number> {
  const key = `hwm_${accountFor(cfg)}`;
  let stored = PAPER_STARTING_CAPITAL;
  try {
    const [row] = await db.select().from(meta).where(eq(meta.key, key)).limit(1);
    if (row) stored = Number(row.value) || PAPER_STARTING_CAPITAL;
  } catch {
    /* meta table absent — use starting capital */
  }
  const hwm = Math.max(stored, currentNav);
  if (hwm > stored) {
    try {
      await db
        .insert(meta)
        .values({ key, value: String(hwm), updatedAt: new Date() })
        .onConflictDoUpdate({ target: meta.key, set: { value: String(hwm), updatedAt: new Date() } });
    } catch {
      /* best-effort */
    }
  }
  return hwm;
}
