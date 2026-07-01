/** `npm run review` — the weekly self-review (model grades its own reasoning). */
import { runSelfReview } from "../lib/self-review";

runSelfReview(7)
  .then((r) => {
    console.log(`self-review [${r.model}] grade ${r.grade ?? "—"}: ${r.summary ?? ""}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("self-review failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
