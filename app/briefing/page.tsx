import { BriefingCard } from "@/components/BriefingCard";
import { Markdown } from "@/components/Markdown";
import { getLatestBriefing, getRecentBriefings } from "@/lib/briefing";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const [latest, recent] = await Promise.all([getLatestBriefing(), getRecentBriefings(14)]);

  // Past briefings = the recent list minus whichever one is currently the latest.
  const past = recent.filter((b) => !(latest && b.id === latest.id));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Briefing</h1>
        <p className="mt-1 text-sm muted">
          A short daily digest — what the brain saw, what it did and why, and how the book sits versus
          SPY. Written after each run in a warm, factual voice.
        </p>
      </section>

      <BriefingCard briefing={latest} />

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide faint">Past briefings</h2>
          <div className="space-y-2">
            {past.map((b) => (
              <details key={b.id} className="card card-hover group overflow-hidden transition-colors">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <ChevronRight
                    size={15}
                    className="shrink-0 faint transition-transform group-open:rotate-90"
                  />
                  <span className="shrink-0 text-xs tabular-nums faint">{b.date}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{b.headline ?? "Briefing"}</span>
                </summary>
                <div className="border-t border-[var(--border)] px-6 py-4">
                  <Markdown className="max-w-prose">{b.markdown}</Markdown>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
