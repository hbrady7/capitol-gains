/**
 * Execution run — takes the latest un-executed decision, runs it through the
 * compliance desk (which can only trim/block), and places it via the adapter
 * chosen by paper/live. Records the guardrail outcome + final size on the
 * decision row. This is the only place that touches the broker.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { decisions } from "./schema";
import { getRunConfig } from "./config";
import { getLatestCandidates } from "./score-run";
import { sizeAndCheck, _latestUnexecutedDecision } from "./guardrails";
import { makeAdapter } from "./execution";

export interface ExecuteResult {
  decisionId: number | null;
  outcome: "placed" | "trimmed" | "blocked" | "none" | "hold";
  reason: string;
  ticker?: string;
  dollars?: number;
  qty?: number;
}

export async function runExecute(): Promise<ExecuteResult> {
  const cfg = await getRunConfig();
  const decision = await _latestUnexecutedDecision();
  if (!decision) return { decisionId: null, outcome: "none", reason: "no un-executed decision" };

  // A hold never reaches the broker.
  if (decision.action !== "buy" || !decision.selectedTicker) {
    await db
      .update(decisions)
      .set({ guardrailOutcome: "blocked", guardrailReason: "model chose hold", finalDollarSize: 0 })
      .where(eq(decisions.id, decision.id));
    return { decisionId: decision.id, outcome: "hold", reason: "model chose hold" };
  }

  const { rows: candidates } = await getLatestCandidates(50);
  const allowed = new Set(candidates.map((c) => c.ticker));

  const verdict = await sizeAndCheck(
    { ticker: decision.selectedTicker, dollars: decision.dollarSize },
    cfg,
    allowed,
  );

  if (!verdict.proceed) {
    await db
      .update(decisions)
      .set({ guardrailOutcome: "blocked", guardrailReason: verdict.reason, finalDollarSize: 0 })
      .where(eq(decisions.id, decision.id));
    return { decisionId: decision.id, outcome: "blocked", reason: verdict.reason, ticker: decision.selectedTicker };
  }

  // Place it.
  const adapter = makeAdapter(cfg);
  const fill = await adapter.placeBuy(decision.selectedTicker, verdict.finalDollars, decision.id);
  await db
    .update(decisions)
    .set({
      guardrailOutcome: verdict.outcome,
      guardrailReason: `${verdict.reason} (via ${adapter.name})`,
      finalDollarSize: fill.dollars,
    })
    .where(eq(decisions.id, decision.id));

  return {
    decisionId: decision.id,
    outcome: verdict.outcome,
    reason: verdict.reason,
    ticker: fill.ticker,
    dollars: fill.dollars,
    qty: fill.qty,
  };
}
