/** `npm run attribute` — fold closed-trade outcomes into per-actor quality. */
import { runAttribution } from "../lib/attribution";

runAttribution()
  .then((r) => {
    console.log(`attribution: ${r.processedFills} sell fills → ${r.actorsUpdated} actors updated${r.note ? ` (${r.note})` : ""}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("attribution failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
