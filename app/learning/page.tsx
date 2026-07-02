import { SelfReviewCard } from "@/components/SelfReviewCard";
import { ActorLeaderboard } from "@/components/ActorLeaderboard";
import { getActorLeaderboard } from "@/lib/attribution";
import { getLatestSelfReview, getRecentSelfReviews } from "@/lib/self-review";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const [actors, latestReview, recentReviews] = await Promise.all([
    getActorLeaderboard(15),
    getLatestSelfReview(),
    getRecentSelfReviews(8),
  ]);

  const pastReviews = recentReviews.filter((r) => !(latestReview && r.id === latestReview.id));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Learning</h1>
        <p className="mt-1 text-sm muted">
          Two feedback loops sharpen the edge. Post-trade{" "}
          <span className="text-[var(--text)]">attribution</span> tunes the score toward actors whose
          buying actually preceded gains; the weekly{" "}
          <span className="text-[var(--text)]">self-review</span> sharpens the judgment behind each
          call.
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <SelfReviewCard review={latestReview} />
        <ActorLeaderboard actors={actors} />
      </div>

      {pastReviews.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide faint">Past self-reviews</h2>
          <div className="space-y-2">
            {pastReviews.map((r) => (
              <details key={r.id} className="card card-hover group overflow-hidden transition-colors">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <ChevronRight
                    size={15}
                    className="shrink-0 faint transition-transform group-open:rotate-90"
                  />
                  <span className="shrink-0 text-xs tabular-nums faint">
                    {r.periodStart} → {r.periodEnd}
                  </span>
                  {r.grade && (
                    <span
                      className="chip shrink-0"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}
                    >
                      {r.grade}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm muted">{r.summary ?? ""}</span>
                </summary>
                {r.critique && (
                  <div className="border-t border-[var(--border)] px-6 py-4 text-sm leading-relaxed muted">
                    {r.summary && <p className="mb-3 text-[var(--text)]">{r.summary}</p>}
                    <p className="whitespace-pre-wrap">{r.critique}</p>
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
