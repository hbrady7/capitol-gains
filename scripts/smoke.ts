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
import { confidenceSize } from "../lib/sizing";
import { computeExitSignals, hasProtective, hasDiscretionary } from "../lib/exits";
import { computeQuality } from "../lib/attribution";
import { runSyntheticBacktest } from "../lib/backtest";

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
    <transactionPricePerShare><value>12</value></transactionPricePerShare>
    <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
    <transactionDate><value>2026-06-02</value></transactionDate></nonDerivativeTransaction>`;
  const rows = parseForm4(xml, { rawUrl: "u", filingDate: "2026-06-03", accession: "a" });
  check("Form 4 parser keeps only the P/A buy (sells off by default)", rows.length === 1 && rows[0].role === "cfo" && rows[0].side === "buy", `${rows.length} kept, role=${rows[0]?.role}`);
  const withSells = parseForm4(xml, { rawUrl: "u", filingDate: "2026-06-03", accession: "a", includeSells: true });
  check("Form 4 parser keeps the S/D sell when asked", withSells.length === 2 && withSells.some((r) => r.side === "sell"), `${withSells.length} kept`);

  // ── 2b. Pure: confidence-weighted sizing stays under the cap and is monotone ──
  const lowConf = confidenceSize({ confidence: 0.3, maxPerPosition: 100, cashAvailable: 1000 });
  const midConf = confidenceSize({ confidence: 0.6, maxPerPosition: 100, cashAvailable: 1000 });
  const hiConf = confidenceSize({ confidence: 0.95, maxPerPosition: 100, cashAvailable: 1000 });
  check("sizing never exceeds the cap", hiConf.suggested <= 100 && midConf.suggested <= 100, `hi=${hiConf.suggested}`);
  check("sizing rises with confidence", lowConf.suggested <= midConf.suggested && midConf.suggested <= hiConf.suggested, `${lowConf.suggested} ≤ ${midConf.suggested} ≤ ${hiConf.suggested}`);
  check("sizing respects available cash", confidenceSize({ confidence: 1, maxPerPosition: 100, cashAvailable: 40 }).suggested <= 40, "cash-bound");

  // ── 2c. Pure: exit signals fire on protective + discretionary triggers ──
  const trail = computeExitSignals(
    { ticker: "X", qty: 1, avgPrice: 100, peakPrice: 120, lastPrice: 90, openedAt: "2026-06-01" },
    { trailingStopPct: 20, hardStopPct: 25, takeProfitPct: 0, maxHoldDays: 90 },
    { offCandidateList: false, congressSelling: false, insiderSelling: false, refutingCatalyst: false },
    "2026-06-20",
  );
  check("trailing stop fires (down 25% from peak)", hasProtective(trail), `triggers=${trail.map((t) => t.type).join(",")}`);
  const thesis = computeExitSignals(
    { ticker: "X", qty: 1, avgPrice: 100, peakPrice: 105, lastPrice: 104, openedAt: "2026-06-01" },
    { trailingStopPct: 20, hardStopPct: 25, takeProfitPct: 0, maxHoldDays: 90 },
    { offCandidateList: true, congressSelling: true, insiderSelling: false, refutingCatalyst: false },
    "2026-06-20",
  );
  check("thesis-invalidation is discretionary, not protective", hasDiscretionary(thesis) && !hasProtective(thesis), `triggers=${thesis.map((t) => t.type).join(",")}`);
  const quiet = computeExitSignals(
    { ticker: "X", qty: 1, avgPrice: 100, peakPrice: 105, lastPrice: 104, openedAt: "2026-06-18" },
    { trailingStopPct: 20, hardStopPct: 25, takeProfitPct: 0, maxHoldDays: 90 },
    { offCandidateList: false, congressSelling: false, insiderSelling: false, refutingCatalyst: false },
    "2026-06-20",
  );
  check("no exit on a fresh, in-the-money, on-list name", quiet.length === 0, `triggers=${quiet.length}`);

  // ── 2d. Pure: attribution quality is bounded and moves with outcomes ──
  const neutral = computeQuality(0, 0, 0);
  const good = computeQuality(10, 8, 1.2);
  const bad = computeQuality(10, 2, -0.6);
  check("neutral prior ≈ 0.5", Math.abs(neutral - 0.5) < 1e-9, `${neutral}`);
  check("quality bounded [0,1] and ordered bad<good", bad >= 0 && good <= 1 && bad < good, `bad=${bad} good=${good}`);

  // ── 2e. Pure: backtest harness runs and reports coherent metrics ──
  const bt = runSyntheticBacktest({ days: 90, seed: 7 });
  check("backtest produces a full series", bt.series.length === 90, `${bt.series.length} points`);
  check("backtest metrics are finite", [bt.metrics.strategyReturn, bt.metrics.spyReturn, bt.metrics.naiveReturn, bt.metrics.vsSpy].every(Number.isFinite), `vsSpy=${bt.metrics.vsSpy}`);

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
