import type { getLatestSelfReview } from "@/lib/self-review";
import { Markdown } from "./Markdown";
import { fmtUsd, fmtPct } from "@/lib/format";
import { GraduationCap } from "lucide-react";

type Review = NonNullable<Awaited<ReturnType<typeof getLatestSelfReview>>>;

interface ReviewChange {
  change: string;
  why: string;
}
interface ReviewStats {
  entries?: number;
  buysPlaced?: number;
  holds?: number;
  exits?: number;
  realizedPnl?: number;
  vsSpyPct?: number | null;
  llmReturnPct?: number | null;
  naiveReturnPct?: number | null;
}

/** The model's weekly self-review — grade, honest critique, and what it would change. */
export function SelfReviewCard({ review }: { review: Review | null }) {
  if (!review) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 text-sm muted">
          <GraduationCap size={16} /> Self-review
        </div>
        <p className="mt-2 text-sm faint">
          No self-review yet — the model grades its own week after enough decisions accumulate.
        </p>
      </div>
    );
  }

  const changes = (review.changes as ReviewChange[] | null) ?? [];
  const stats = (review.stats as ReviewStats | null) ?? null;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-4">
        <GraduationCap size={18} className="link-accent" />
        <h2 className="text-base font-semibold">Self-review</h2>
        {review.grade && (
          <span
            className="chip"
            style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}
          >
            grade {review.grade}
          </span>
        )}
        <span className="ml-auto text-xs faint">
          {review.periodStart} → {review.periodEnd}
        </span>
      </div>

      <div className="space-y-5 p-5">
        {review.summary && <p className="text-[0.95rem] leading-relaxed">{review.summary}</p>}

        {review.critique && (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide faint">Critique</div>
            <Markdown className="max-w-prose">{review.critique}</Markdown>
          </div>
        )}

        {changes.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide faint">What I&apos;d change</div>
            <ul className="space-y-2">
              {changes.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed">
                  <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                  <span>
                    <span className="font-medium text-[var(--text)]">{c.change}</span>
                    {c.why && <span className="muted"> — {c.why}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-6">
            <Stat label="Entries" value={String(stats.entries ?? 0)} />
            <Stat label="Buys" value={String(stats.buysPlaced ?? 0)} />
            <Stat label="Holds" value={String(stats.holds ?? 0)} />
            <Stat label="Exits" value={String(stats.exits ?? 0)} />
            <Stat
              label="Realized"
              value={fmtUsd(stats.realizedPnl ?? 0)}
              color={(stats.realizedPnl ?? 0) >= 0 ? "var(--sage)" : "var(--danger)"}
            />
            <Stat
              label="vs SPY"
              value={stats.vsSpyPct == null ? "—" : fmtPct(stats.vsSpyPct)}
              color={
                stats.vsSpyPct == null ? undefined : stats.vsSpyPct >= 0 ? "var(--sage)" : "var(--danger)"
              }
            />
          </div>
        )}

        {review.model && review.model !== "none" && (
          <p className="text-xs faint">reviewed by {review.model}</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide faint">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
