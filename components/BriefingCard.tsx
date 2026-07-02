import type { getLatestBriefing } from "@/lib/briefing";
import { Markdown } from "./Markdown";
import { timeAgo } from "@/lib/format";
import { Coffee } from "lucide-react";

type Briefing = NonNullable<Awaited<ReturnType<typeof getLatestBriefing>>>;

/** The morning briefing — a pleasant, readable daily digest. */
export function BriefingCard({ briefing }: { briefing: Briefing | null }) {
  if (!briefing) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 text-sm muted">
          <Coffee size={16} /> Morning briefing
        </div>
        <p className="mt-2 text-sm faint">
          No briefing yet — it&apos;s written after the day&apos;s run.
        </p>
      </div>
    );
  }

  const when = briefing.createdAt ? new Date(briefing.createdAt) : null;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <Coffee size={18} className="link-accent" />
        <h2 className="text-base font-semibold">Morning briefing</h2>
        <span className="text-xs faint">{briefing.date}</span>
        {when && <span className="text-xs faint">· {timeAgo(when.toISOString())}</span>}
        {briefing.model && briefing.model !== "none" && (
          <span className="chip ml-auto">{briefing.model}</span>
        )}
      </div>
      <div className="px-6 py-5">
        <Markdown className="max-w-prose">{briefing.markdown}</Markdown>
      </div>
    </div>
  );
}
