/**
 * Sell-compliance desk — the exit-side mirror of lib/guardrails.ts.
 *
 * It can ONLY halt or TRIM a proposed sell; it never originates a sell of a name the
 * book doesn't hold, and it never sells MORE than is held (long-only — no shorting).
 *
 *   kill switch      → block everything (place nothing, symmetric with the buy desk)
 *   not held         → block (can't originate a sell of an unheld name)
 *   qty > held       → trim down to the held quantity
 *   qty <= 0         → block
 *
 * Every outcome is recorded on the exit decision row for the same audit trail.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { positions } from "./schema";
import { accountFor, type RunConfig } from "./config";

export type SellOutcome = "placed" | "trimmed" | "blocked";

export interface SellVerdict {
  proceed: boolean;
  finalQty: number;
  outcome: SellOutcome;
  reason: string;
}

export interface ProposedSell {
  ticker: string;
  qty: number;
}

/** Evaluate a proposed SELL against the sell-side bounds. */
export async function checkSell(proposed: ProposedSell, cfg: RunConfig): Promise<SellVerdict> {
  const block = (reason: string): SellVerdict => ({ proceed: false, finalQty: 0, outcome: "blocked", reason });

  // 1. Kill switch — place nothing (matches the buy desk / CLAUDE.md).
  if (cfg.killSwitch) return block("kill switch is ON — no orders placed");

  const ticker = (proposed.ticker || "").toUpperCase().trim();
  if (!ticker) return block("no ticker on the proposed sell");
  if (!(proposed.qty > 0)) return block("proposed sell quantity is not positive");

  // 2. Must hold the name (never originate a sell; long-only, no shorting).
  const account = accountFor(cfg);
  let held = 0;
  try {
    const [row] = await db
      .select({ q: sql<number>`coalesce(sum(${positions.qty}), 0)` })
      .from(positions)
      .where(and(eq(positions.account, account), eq(positions.ticker, ticker)));
    held = Number(row?.q ?? 0);
  } catch {
    held = 0;
  }
  if (held <= 0) return block(`not holding ${ticker} — cannot sell (long-only)`);

  // 3. Clamp DOWN to the held quantity — never sell more than held.
  let qty = proposed.qty;
  if (qty > held) {
    qty = Number(held.toFixed(4));
    return { proceed: true, finalQty: qty, outcome: "trimmed", reason: `trimmed to held qty ${qty}` };
  }
  qty = Number(qty.toFixed(4));
  if (qty <= 0) return block("clamped sell quantity reached zero");
  return { proceed: true, finalQty: qty, outcome: "placed", reason: "within all bounds" };
}
