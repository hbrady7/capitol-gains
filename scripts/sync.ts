/** `npm run sync` — pull congressional trades into the local DB. */
import { runSync } from "../lib/sync";

runSync()
  .then((r) => {
    if (r.error) {
      console.error(`sync failed (${r.source}): ${r.error}`);
      process.exit(1);
    }
    console.log(`synced from ${r.source}: fetched=${r.fetched} inserted=${r.inserted} skipped=${r.skipped}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
