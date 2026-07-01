/** `npm run exits` — the sell side: protective stops + LLM thesis-invalidation exits. */
import { runExits } from "../lib/exit-run";

runExits()
  .then((r) => {
    console.log(`exits: reviewed ${r.reviewed}${r.note ? ` (${r.note})` : ""}`);
    for (const a of r.actions) {
      console.log(`  ${a.path.toUpperCase()} ${a.outcome.toUpperCase()} ${a.ticker}${a.dollars != null ? " $" + a.dollars : ""}${a.realizedPnl != null ? ` pnl $${a.realizedPnl}` : ""} — ${a.reason}`);
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error("exits failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
