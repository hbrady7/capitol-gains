/**
 * The compliance desk. The LLM is the portfolio manager; this deterministic layer
 * is the compliance desk between the model and the broker. It can ONLY block or
 * trim what the model proposed — it never originates or upsizes a decision.
 *
 *   kill switch            → block everything
 *   hard caps              → clamp down (per-position, per-day, available cash)
 *   max open positions     → block a new name when full
 *   dedup / cooldown       → block re-buying a name held / bought recently
 *   drawdown halt          → block AND flip the kill switch
 *   sanity                 → ticker must be a real, on-list US equity; long only
 *
 * Everything is recorded on the decision row (placed | trimmed | blocked + reason)
 * for a full audit trail.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { fills } from "./schema";
import { accountFor, saveRunConfig, type RunConfig } from "./config";
import {
  getAvailableCash,
  getHighWaterMark,
  getNav,
  getOpenPositions,
  getSpentToday,
} from "./book";

export type GuardrailOutcome = "placed" | "trimmed" | "blocked";

export interface Verdict {
  proceed: boolean;
  finalDollars: number;
  outcome: GuardrailOutcome;
  reason: string;
}

export interface ProposedBuy {
  ticker: string;
  dollars: number;
}

const TICKER_RE = /^[A-Z]{1,5}$/;

/** Evaluate a proposed BUY against all hard bounds. Allowed tickers must come from
 *  the latest scored candidates (so the model can't go off-list). */
export async function sizeAndCheck(
  proposed: ProposedBuy,
  cfg: RunConfig,
  allowedTickers: Set<string>,
): Promise<Verdict> {
  const block = (reason: string): Verdict => ({ proceed: false, finalDollars: 0, outcome: "blocked", reason });

  // 1. Kill switch.
  if (cfg.killSwitch) return block("kill switch is ON — no orders placed");

  const ticker = (proposed.ticker || "").toUpperCase().trim();

  // 2. Sanity — real, on-list, long-only equity.
  if (!ticker || !TICKER_RE.test(ticker)) return block(`ticker '${ticker}' is not a valid US equity symbol`);
  if (allowedTickers.size > 0 && !allowedTickers.has(ticker)) {
    return block(`ticker ${ticker} is not in the current candidate set (off-list)`);
  }
  if (!(proposed.dollars > 0)) return block("proposed dollar size is not positive");

  // 3. Drawdown halt — flip the kill switch and stop.
  const nav = await getNav(cfg);
  const hwm = await getHighWaterMark(cfg, nav); // also advances HWM if nav is a new high
  if (hwm > 0) {
    const ddPct = ((hwm - nav) / hwm) * 100;
    if (ddPct > cfg.drawdownHaltPct) {
      await saveRunConfig({ killSwitch: true });
      return block(
        `drawdown ${ddPct.toFixed(1)}% exceeds halt ${cfg.drawdownHaltPct}% — kill switch flipped ON`,
      );
    }
  }

  // 4. Dedup / cooldown — already held, or bought within cooldown_days.
  const positions = await getOpenPositions(cfg);
  const held = positions.find((p) => p.ticker === ticker);
  if (held) return block(`already holding ${ticker} (dedup)`);
  const cooled = await boughtWithinCooldown(cfg, ticker, cfg.cooldownDays);
  if (cooled) return block(`${ticker} bought within the last ${cfg.cooldownDays}d (cooldown)`);

  // 5. Max open positions (new name only — held already returned above).
  if (positions.length >= cfg.maxOpenPositions) {
    return block(`at max open positions (${cfg.maxOpenPositions})`);
  }

  // 6. Caps — clamp, never reject for being too big.
  let dollars = proposed.dollars;
  const reasons: string[] = [];
  if (dollars > cfg.maxPerPosition) {
    reasons.push(`per-position cap $${cfg.maxPerPosition}`);
    dollars = cfg.maxPerPosition;
  }
  const spentToday = await getSpentToday(cfg);
  const dayRemaining = Math.max(0, cfg.maxPerDay - spentToday);
  if (dayRemaining <= 0) return block(`per-day cap $${cfg.maxPerDay} already used ($${spentToday.toFixed(0)})`);
  if (dollars > dayRemaining) {
    reasons.push(`per-day remaining $${dayRemaining.toFixed(0)}`);
    dollars = dayRemaining;
  }
  const cash = await getAvailableCash(cfg);
  if (cash <= 0) return block("no available cash");
  if (dollars > cash) {
    reasons.push(`available cash $${cash.toFixed(0)}`);
    dollars = cash;
  }

  dollars = Number(dollars.toFixed(2));
  if (dollars <= 0) return block("clamped size reached zero");

  if (reasons.length > 0) {
    return { proceed: true, finalDollars: dollars, outcome: "trimmed", reason: `trimmed to $${dollars} by ${reasons.join(", ")}` };
  }
  return { proceed: true, finalDollars: dollars, outcome: "placed", reason: "within all bounds" };
}

async function boughtWithinCooldown(cfg: RunConfig, ticker: string, days: number): Promise<boolean> {
  if (days <= 0) return false;
  const since = new Date(Date.now() - days * 86400000);
  try {
    const [row] = await db
      .select({ c: sql<number>`count(*)` })
      .from(fills)
      .where(
        and(
          eq(fills.account, accountFor(cfg)),
          eq(fills.ticker, ticker),
          eq(fills.side, "buy"),
          gte(fills.ts, since),
        ),
      );
    return Number(row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Most recent ENTRY (buy) decision that hasn't been executed yet. Exit decisions
 *  are handled by their own desk (lib/exits.ts) and are excluded here. */
export async function _latestUnexecutedDecision() {
  const { decisions } = await import("./schema");
  const [row] = await db
    .select()
    .from(decisions)
    .where(sql`${decisions.guardrailOutcome} is null and ${decisions.kind} = 'entry'`)
    .orderBy(desc(decisions.createdAt))
    .limit(1);
  return row ?? null;
}
