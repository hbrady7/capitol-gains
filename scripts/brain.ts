/**
 * `npm run brain` — the full autonomous pipeline in one process:
 *   ingest (congress + Form 4 + catalysts) → score (CCS, attribution-tilted) →
 *   decide (Opus, confidence-sized) → execute (compliance + place) →
 *   exits (protective stops + LLM thesis exits) → attribute (learning loop) →
 *   baselines (three-way NAV) → brief (morning digest).
 * Each stage logs; a stage failure stops the run loudly rather than guessing.
 */
import { runIngest } from "../lib/ingest";
import { runScore } from "../lib/score-run";
import { runDecide } from "../lib/decide";
import { runExecute } from "../lib/execute";
import { runExits } from "../lib/exit-run";
import { runAttribution } from "../lib/attribution";
import { runBaselines } from "../lib/baselines";
import { runBriefing } from "../lib/briefing";

async function main() {
  console.log("── ingest ──");
  const ing = await runIngest();
  console.log(`  congress: +${ing.congress.inserted}  insider: +${ing.insider.inserted}  catalysts: +${ing.catalysts.inserted}`);

  console.log("── score ──");
  const sc = await runScore();
  console.log(`  candidates=${sc.candidates} top=${sc.topTicker ?? "—"} convergent=${sc.withConvergence}`);

  console.log("── decide ──");
  const dec = await runDecide();
  console.log(`  ${dec.decision.action.toUpperCase()} ${dec.decision.ticker || "—"} $${dec.decision.dollar_size}`);

  console.log("── execute ──");
  const ex = await runExecute();
  console.log(`  ${ex.outcome.toUpperCase()} ${ex.ticker ?? ""} ${ex.dollars != null ? "$" + ex.dollars : ""} — ${ex.reason}`);

  console.log("── exits ──");
  const xt = await runExits();
  console.log(`  reviewed ${xt.reviewed}; ${xt.actions.length} action(s)`);

  console.log("── attribute ──");
  const at = await runAttribution();
  console.log(`  ${at.processedFills} sell fills → ${at.actorsUpdated} actors`);

  console.log("── baselines ──");
  const bl = await runBaselines();
  console.log(`  LLM=$${bl.llm} SPY=$${bl.spy} naive=$${bl.naive}`);

  console.log("── brief ──");
  const br = await runBriefing();
  console.log(`  ${br.headline ?? "(briefing written)"}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("brain failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
