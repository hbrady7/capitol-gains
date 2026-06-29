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
import { fills, positions } from "./schema";
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

/** Available cash = starting capital − cost basis deployed. Never negative. */
export async function getAvailableCash(cfg: Pick<RunConfig, "paperMode">): Promise<number> {
  const deployed = await getDeployedCost(cfg);
  return Math.max(0, PAPER_STARTING_CAPITAL - deployed);
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

/** Live-marked NAV of the book (cash + market value of positions). */
export async function getNav(cfg: Pick<RunConfig, "paperMode">): Promise<number> {
  const pos = await getOpenPositions(cfg);
  const cash = await getAvailableCash(cfg);
  if (pos.length === 0) return cash;
  const quotes = await getLastCloses(pos.map((p) => p.ticker));
  const mv = pos.reduce((s, p) => s + p.qty * (quotes[p.ticker]?.price ?? p.avgPrice), 0);
  return cash + mv;
}
