/** `npm run score` — compute the Convergence Conviction Score over recent buys. */
import { runScore } from "../lib/score-run";

runScore()
  .then((r) => {
    console.log(
      `scored run=${r.runId}: candidates=${r.candidates} top=${r.topTicker ?? "—"} ` +
        `convergent=${r.withConvergence}`,
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("score failed:", e);
    process.exit(1);
  });
