/**
 * `npm run backtest` — replay the strategy over a synthetic (or, later, real)
 * disclosure history and print strategy vs SPY vs naive. Uses the SAME pure scorer
 * and exit engine as the live loop, so tuning here predicts live behavior.
 *
 * Flags: --days=N --seed=N --k=1.5 --trail=20 --hard=25 --hold=90 --cap=100
 */
import { runSyntheticBacktest } from "../lib/backtest";

function arg(name: string, dflt: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const v = Number(hit.split("=")[1]);
  return Number.isFinite(v) ? v : dflt;
}

const days = arg("days", 120);
const res = runSyntheticBacktest({
  days,
  seed: arg("seed", 7),
  scoring: {
    lookbackDays: 45,
    wCong: 1,
    wIns: 1,
    kConverge: arg("k", 1.5),
    freshnessCutoffDays: 21,
    minDollarVolume: 5_000_000,
  },
  exits: {
    trailingStopPct: arg("trail", 20),
    hardStopPct: arg("hard", 25),
    takeProfitPct: arg("tp", 0),
    maxHoldDays: arg("hold", 90),
  },
  maxPerPosition: arg("cap", 100),
});

const m = res.metrics;
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
console.log(`\nBacktest over ${days} days (${res.series[0]?.date} → ${res.series[res.series.length - 1]?.date})`);
console.log("─".repeat(52));
console.log(`  strategy   ${pct(m.strategyReturn)}`);
console.log(`  SPY        ${pct(m.spyReturn)}`);
console.log(`  naive      ${pct(m.naiveReturn)}`);
console.log("─".repeat(52));
console.log(`  vs SPY     ${pct(m.vsSpy)}`);
console.log(`  vs naive   ${pct(m.vsNaive)}`);
console.log(`  max DD     ${m.maxDrawdownPct}%`);
console.log(`  trades     ${m.trades}  exits ${m.exits}  win-rate ${m.winRatePct ?? "—"}%`);
process.exit(0);
