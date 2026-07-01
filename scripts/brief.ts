/** `npm run brief` — write today's morning briefing (LLM-narrated, stored). */
import { runBriefing } from "../lib/briefing";

runBriefing()
  .then((r) => {
    console.log(`briefing ${r.date} [${r.model}]: ${r.headline ?? ""}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("briefing failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
