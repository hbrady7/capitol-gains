import { DecisionCard } from "@/components/DecisionCard";
import { PortfolioCard } from "@/components/PortfolioCard";
import { CandidateLeaderboard } from "@/components/CandidateLeaderboard";
import { ExitDeskStrip } from "@/components/ExitDeskStrip";
import {
  getLatestEntryDecision,
  getRecentExitDecisions,
  getLatestCandidatesView,
  getPortfolioView,
} from "@/lib/dashboard-v2";
import { getCatalystsForTickers } from "@/lib/catalysts";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [decision, exits, { rows: candidates }, pf] = await Promise.all([
    getLatestEntryDecision(),
    getRecentExitDecisions(8),
    getLatestCandidatesView(12),
    getPortfolioView(),
  ]);

  const catalysts = await getCatalystsForTickers(candidates.map((r) => r.ticker));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-sm muted">
          What Claude decided, why, and how the experiment is going. The edge is the{" "}
          <span className="text-[var(--text)]">convergence</span> — names where U.S. politicians and
          corporate insiders are buying the same stock at the same time.
        </p>
      </section>

      <DecisionCard decision={decision} />

      <PortfolioCard pf={pf} />

      <ExitDeskStrip exits={exits} />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide faint">Convergence leaderboard</h2>
          <span className="text-xs faint">ranked by Convergence Conviction Score</span>
        </div>
        <CandidateLeaderboard candidates={candidates} catalysts={catalysts} />
      </section>
    </div>
  );
}
