import { DecisionCard } from "@/components/DecisionCard";
import { PortfolioCard } from "@/components/PortfolioCard";
import { CandidateLeaderboard } from "@/components/CandidateLeaderboard";
import { getLatestDecision, getLatestCandidatesView, getPortfolioView } from "@/lib/dashboard-v2";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [decision, { rows: candidates }, pf] = await Promise.all([
    getLatestDecision(),
    getLatestCandidatesView(12),
    getPortfolioView(),
  ]);

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

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide faint">Convergence leaderboard</h2>
          <span className="text-xs faint">ranked by Convergence Conviction Score</span>
        </div>
        <CandidateLeaderboard candidates={candidates} />
      </section>
    </div>
  );
}
