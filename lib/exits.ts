/**
 * The exit desk — the sell side the system was missing.
 *
 * Two tiers, mirroring the safety model on the buy side:
 *
 *   PROTECTIVE (deterministic, like the drawdown breaker) — a trailing stop from the
 *   position's high-water mark, a hard stop from cost, an optional take-profit, and a
 *   time-decay exit. These fire by rule, no model call, and sell the WHOLE position.
 *   They are pure risk controls and can only reduce exposure.
 *
 *   DISCRETIONARY (LLM-reasoned) — thesis invalidation: the name has fallen off the
 *   fresh convergence list, or the same informed populations that BOUGHT are now
 *   SELLING, or a refuting catalyst appeared. Here Claude reviews the position with
 *   its P&L, holding period and the fresh sell-side evidence and proposes sell
 *   (full/partial)/hold with a reasoning trace.
 *
 * A separate sell-compliance desk (lib/exit-guardrails.ts) can only halt or TRIM a
 * sell (long-only: never sell more than held) — symmetric with the buy side. It can
 * never originate a sell of an unheld name.
 *
 * This module's core is a PURE function so it is unit-tested with no database.
 */

export interface ExitPolicy {
  trailingStopPct: number; // sell if down this % from the trailing peak (0 = off)
  hardStopPct: number; // sell if down this % from cost basis (0 = off)
  takeProfitPct: number; // sell if up this % from cost basis (0 = off)
  maxHoldDays: number; // time-decay exit after this many days held (0 = off)
}

export interface ExitPositionInput {
  ticker: string;
  qty: number;
  avgPrice: number;
  peakPrice: number; // trailing high-water since entry
  lastPrice: number;
  openedAt: string; // ISO yyyy-mm-dd
}

/** Fresh sell-side / thesis-decay signals gathered from the DB for a held name. */
export interface ExitThesisSignals {
  offCandidateList: boolean; // no longer on the latest fresh convergence run
  congressSelling: boolean; // members disclosed sells since entry
  insiderSelling: boolean; // insiders filed open-market sells since entry
  refutingCatalyst: boolean; // a refuting catalyst appeared since entry
}

export type ExitTriggerType =
  | "trailing_stop"
  | "hard_stop"
  | "take_profit"
  | "time_decay"
  | "thesis_invalidation";

export interface ExitTrigger {
  type: ExitTriggerType;
  severity: "protective" | "discretionary";
  detail: string;
}

const daysBetween = (aIso: string, bIso: string): number => {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
};

/** Pure: evaluate every exit trigger for one position. Order: protective first. */
export function computeExitSignals(
  pos: ExitPositionInput,
  policy: ExitPolicy,
  thesis: ExitThesisSignals,
  today: string,
): ExitTrigger[] {
  const triggers: ExitTrigger[] = [];
  const peak = Math.max(pos.peakPrice || pos.avgPrice, pos.lastPrice);
  const last = pos.lastPrice;

  // ── protective (deterministic) ──
  if (policy.trailingStopPct > 0 && peak > 0) {
    const ddPct = ((peak - last) / peak) * 100;
    if (ddPct >= policy.trailingStopPct) {
      triggers.push({
        type: "trailing_stop",
        severity: "protective",
        detail: `down ${ddPct.toFixed(1)}% from peak $${peak.toFixed(2)} ≥ trailing stop ${policy.trailingStopPct}%`,
      });
    }
  }
  if (policy.hardStopPct > 0 && pos.avgPrice > 0) {
    const lossPct = ((pos.avgPrice - last) / pos.avgPrice) * 100;
    if (lossPct >= policy.hardStopPct) {
      triggers.push({
        type: "hard_stop",
        severity: "protective",
        detail: `down ${lossPct.toFixed(1)}% from cost $${pos.avgPrice.toFixed(2)} ≥ hard stop ${policy.hardStopPct}%`,
      });
    }
  }
  if (policy.takeProfitPct > 0 && pos.avgPrice > 0) {
    const gainPct = ((last - pos.avgPrice) / pos.avgPrice) * 100;
    if (gainPct >= policy.takeProfitPct) {
      triggers.push({
        type: "take_profit",
        severity: "protective",
        detail: `up ${gainPct.toFixed(1)}% from cost ≥ take profit ${policy.takeProfitPct}%`,
      });
    }
  }
  if (policy.maxHoldDays > 0) {
    const held = daysBetween(pos.openedAt, today);
    if (held > policy.maxHoldDays) {
      triggers.push({
        type: "time_decay",
        severity: "protective",
        detail: `held ${held}d > max hold ${policy.maxHoldDays}d — the weeks-stale edge has decayed`,
      });
    }
  }

  // ── discretionary (LLM reviews these) ──
  const decay: string[] = [];
  if (thesis.congressSelling) decay.push("members now selling");
  if (thesis.insiderSelling) decay.push("insiders now selling");
  if (thesis.offCandidateList) decay.push("off the fresh convergence list");
  if (thesis.refutingCatalyst) decay.push("a refuting catalyst appeared");
  if (decay.length > 0) {
    triggers.push({
      type: "thesis_invalidation",
      severity: "discretionary",
      detail: decay.join("; "),
    });
  }

  return triggers;
}

export const hasProtective = (ts: ExitTrigger[]) => ts.some((t) => t.severity === "protective");
export const hasDiscretionary = (ts: ExitTrigger[]) => ts.some((t) => t.severity === "discretionary");
