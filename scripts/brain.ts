/**
 * `npm run brain` — the full autonomous pipeline in one process:
 *   ingest (congress + Form 4) → score (CCS) → decide (Opus) → execute (compliance + place).
 * Used by the combined GitHub Actions cron. Each stage logs; a stage failure stops
 * the run loudly rather than guessing.
 */
import { runIngest } from "../lib/ingest";
import { runScore } from "../lib/score-run";
import { runDecide } from "../lib/decide";
import { runExecute } from "../lib/execute";

async function main() {
  console.log("── ingest ──");
  const ing = await runIngest();
  console.log(`  congress: +${ing.congress.inserted}  insider: +${ing.insider.inserted}`);

  console.log("── score ──");
  const sc = await runScore();
  console.log(`  candidates=${sc.candidates} top=${sc.topTicker ?? "—"} convergent=${sc.withConvergence}`);

  console.log("── decide ──");
  const dec = await runDecide();
  console.log(`  ${dec.decision.action.toUpperCase()} ${dec.decision.ticker || "—"} $${dec.decision.dollar_size}`);

  console.log("── execute ──");
  const ex = await runExecute();
  console.log(`  ${ex.outcome.toUpperCase()} ${ex.ticker ?? ""} ${ex.dollars != null ? "$" + ex.dollars : ""} — ${ex.reason}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("brain failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
