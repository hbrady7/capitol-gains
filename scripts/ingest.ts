/** `npm run ingest` — pull BOTH feeds (congress + EDGAR Form 4) into the DB. */
import { runIngest } from "../lib/ingest";

runIngest()
  .then((r) => {
    const c = r.congress;
    const i = r.insider;
    console.log(
      `congress (${c.source}): fetched=${c.fetched} inserted=${c.inserted} skipped=${c.skipped}` +
        (c.error ? ` error=${c.error}` : ""),
    );
    console.log(
      `insider  (${i.source}): fetched=${i.fetched} inserted=${i.inserted} skipped=${i.skipped}` +
        (i.error ? ` error=${i.error}` : ""),
    );
    process.exit(c.error && i.error ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
