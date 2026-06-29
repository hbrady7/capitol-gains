/** `npm run decide` — Claude Opus 4.8 picks the single best buy (or holds). */
import { runDecide } from "../lib/decide";

runDecide()
  .then((r) => {
    const d = r.decision;
    console.log(`decision (${r.model}): ${d.action.toUpperCase()} ${d.ticker || "—"} $${d.dollar_size} conf=${d.confidence}`);
    console.log(`thesis: ${d.thesis}`);
    console.log(`decisionId=${r.decisionId} runId=${r.runId}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("decide failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
