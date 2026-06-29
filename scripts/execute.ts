/** `npm run execute` — run the latest decision through compliance + place it. */
import { runExecute } from "../lib/execute";

runExecute()
  .then((r) => {
    console.log(
      `execute: ${r.outcome.toUpperCase()} ${r.ticker ?? ""} ${r.dollars != null ? "$" + r.dollars : ""} ` +
        `${r.qty != null ? r.qty + "sh" : ""} — ${r.reason}`,
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("execute failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
