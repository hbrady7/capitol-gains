/**
 * Light smoke test: migrations applied -> sync returns rows -> core data layer
 * loads without throwing. Run with `npm run smoke` (after `npm run db:migrate`).
 */
import { runSync } from "../lib/sync";
import { getReviewSignals, getBrief } from "../lib/dashboard-data";
import { getPortfolio } from "../lib/portfolio";
import { getScoreboard } from "../lib/scoreboard";

async function main() {
  const checks: [string, boolean, string][] = [];

  const sync = await runSync();
  checks.push(["sync ran without error", !sync.error, sync.error ?? `fetched=${sync.fetched} inserted=${sync.inserted}`]);

  const { signals } = await getReviewSignals();
  checks.push(["review signals present", signals.length > 0, `${signals.length} signals`]);

  const brief = await getBrief();
  checks.push(["brief computed", brief.total > 0, `total=${brief.total} buys=${brief.buys}`]);

  const pf = await getPortfolio();
  checks.push(["portfolio loads (graceful when empty)", pf !== null, pf.connected ? "has fills" : "no fills yet (ok)"]);

  const sb = await getScoreboard();
  checks.push(["scoreboard loads (graceful when empty)", sb !== null, sb.hasData ? "has history" : "no history yet (ok)"]);

  let allPass = true;
  for (const [name, pass, detail] of checks) {
    console.log(`${pass ? "✓" : "✗"} ${name} — ${detail}`);
    if (!pass) allPass = false;
  }
  console.log(allPass ? "\nSMOKE PASS" : "\nSMOKE FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE FAIL —", e);
  process.exit(1);
});
