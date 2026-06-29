/** `npm run baselines` — snapshot today's three-way NAV (LLM / SPY / naive basket). */
import { runBaselines } from "../lib/baselines";

runBaselines()
  .then((r) => {
    console.log(`baselines ${r.date}: LLM=$${r.llm} SPY=$${r.spy} naive=$${r.naive}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("baselines failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
