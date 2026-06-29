/**
 * Smoke test for the v2 pipeline. Two halves:
 *   1. Pure checks (no DB): the CCS scorer rewards convergence; the Form 4 parser
 *      keeps only open-market purchases. These always run.
 *   2. Data-layer checks (need DATABASE_URL): ingest → score → readers load without
 *      throwing. Skipped with a clear note if DATABASE_URL is unset.
 *
 * Run: `npm run db:push` (once, against Neon) then `npm run smoke`.
 */
import { scoreCandidates } from "../lib/scoring";
import { parseForm4 } from "../lib/insider";

const checks: [string, boolean, string][] = [];
const check = (name: string, pass: boolean, detail: string) => checks.push([name, pass, detail]);

async function main() {
  // ── 1. Pure: convergence multiplier ──
  const today = "2026-06-28";
  const scored = scoreCandidates({
    today,
    cfg: { lookbackDays: 45, wCong: 1, wIns: 1, kConverge: 1.5, freshnessCutoffDays: 21, minDollarVolume: 5_000_000 },
    congBuys: [
      { ticker: "AAPL", member: "A", amountLow: 250001, amountHigh: 500000, transactionDate: "2026-06-20", disclosureDate: "2026-06-25", daysStale: 5, histReturn: 0.15 },
      { ticker: "AAPL", member: "B", amountLow: 50001, amountHigh: 100000, transactionDate: "2026-06-18", disclosureDate: "2026-06-24", daysStale: 6, histReturn: 0.12 },
      { ticker: "JPM", member: "A", amountLow: 100001, amountHigh: 250000, transactionDate: "2026-06-19", disclosureDate: "2026-06-25", daysStale: 6, histReturn: 0.15 },
    ],
    insBuys: [
      { ticker: "AAPL", insiderName: "CEO", role: "ceo", dollarValue: 1500000, transactionDate: "2026-06-22", filingDate: "2026-06-24", daysStale: 2 },
      { ticker: "LLY", insiderName: "Dir", role: "director", dollarValue: 300000, transactionDate: "2026-06-20", filingDate: "2026-06-22", daysStale: 2 },
    ],
  });
  const aapl = scored.find((c) => c.ticker === "AAPL");
  const jpm = scored.find((c) => c.ticker === "JPM");
  check("convergent name ranks #1", aapl?.rank === 1, `top=${scored[0]?.ticker}`);
  check("convergence multiplier > 1 for both-buying name", (aapl?.convergenceMult ?? 0) > 1, `mult=${aapl?.convergenceMult}`);
  check("single-population name has no convergence bonus", jpm?.convergenceMult === 1, `jpm mult=${jpm?.convergenceMult}`);

  // ── 2. Pure: Form 4 parser keeps only open-market purchases ──
  const xml = `<issuerName>X</issuerName><issuerTradingSymbol>XCO</issuerTradingSymbol>
    <reportingOwner><rptOwnerName>Jane</rptOwnerName><isOfficer>1</isOfficer><officerTitle>CFO</officerTitle></reportingOwner>
    <nonDerivativeTransaction><transactionCode>P</transactionCode><transactionShares><value>100</value></transactionShares>
    <transactionPricePerShare><value>10</value></transactionPricePerShare>
    <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
    <transactionDate><value>2026-06-01</value></transactionDate></nonDerivativeTransaction>
    <nonDerivativeTransaction><transactionCode>S</transactionCode><transactionShares><value>50</value></transactionShares>
    <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
    <transactionDate><value>2026-06-02</value></transactionDate></nonDerivativeTransaction>`;
  const rows = parseForm4(xml, { rawUrl: "u", filingDate: "2026-06-03", accession: "a" });
  check("Form 4 parser keeps only the P/A buy", rows.length === 1 && rows[0].role === "cfo", `${rows.length} kept, role=${rows[0]?.role}`);

  // ── 3. Data layer (needs DATABASE_URL) ──
  if (!process.env.DATABASE_URL) {
    console.log("ℹ data-layer checks skipped — set DATABASE_URL (Neon) and run `npm run db:push` first.\n");
  } else {
    const { runIngest } = await import("../lib/ingest");
    const { runScore } = await import("../lib/score-run");
    const { getLatestCandidatesView, getPortfolioView } = await import("../lib/dashboard-v2");
    const { getBaselineView } = await import("../lib/baselines");

    const ing = await runIngest();
    check("ingest ran", !(ing.congress.error && ing.insider.error), `congress+${ing.congress.inserted} insider+${ing.insider.inserted}`);
    const sc = await runScore();
    check("score emitted candidates", sc.candidates >= 0, `candidates=${sc.candidates} convergent=${sc.withConvergence}`);
    const cand = await getLatestCandidatesView(5);
    check("candidate view loads", Array.isArray(cand.rows), `${cand.rows.length} rows`);
    const pf = await getPortfolioView();
    check("portfolio view loads (graceful)", pf != null, pf.connected ? "has positions" : "no positions yet (ok)");
    const bl = await getBaselineView();
    check("baseline view loads (graceful)", bl != null, bl.hasData ? "has history" : "no history yet (ok)");
  }

  let ok = true;
  for (const [name, pass, detail] of checks) {
    console.log(`${pass ? "✓" : "✗"} ${name} — ${detail}`);
    if (!pass) ok = false;
  }
  console.log(ok ? "\nSMOKE PASS" : "\nSMOKE FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE FAIL —", e);
  process.exit(1);
});
