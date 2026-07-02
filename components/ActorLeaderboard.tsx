import type { getActorLeaderboard } from "@/lib/attribution";
import { fmtPct } from "@/lib/format";
import { Landmark, Briefcase } from "lucide-react";

type Actor = Awaited<ReturnType<typeof getActorLeaderboard>>[number];

/** Ranked list of informed actors by learned post-trade quality. */
export function ActorLeaderboard({ actors }: { actors: Actor[] }) {
  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide faint">Informed actors</h2>
      <p className="mt-1 text-xs faint">
        Learned from post-trade outcomes — tilts the CCS toward actors whose buying actually preceded
        gains.
      </p>

      {actors.length === 0 ? (
        <p className="mt-4 text-sm faint">
          No closed trades yet — quality sharpens as positions close.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {actors.map((a, i) => (
            <ActorRow key={`${a.kind}:${a.actor}`} a={a} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActorRow({ a, rank }: { a: Actor; rank: number }) {
  const isCongress = a.kind === "congress";
  const color = isCongress ? "var(--sky)" : "var(--sage)";
  const soft = isCongress ? "var(--sky-soft)" : "var(--sage-soft)";
  const avg = a.closedTrades > 0 ? a.sumReturn / a.closedTrades : 0;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="w-5 text-center text-sm faint">{rank}</div>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{a.actor}</div>
        <span className="chip shrink-0" style={{ background: soft, borderColor: "transparent", color }}>
          {isCongress ? <Landmark size={11} /> : <Briefcase size={11} />}
          {isCongress ? "congress" : "insider"}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-3 pl-8">
        <div className="bar-track h-2 flex-1">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round(a.quality * 100)}%`, background: color }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums muted">
          {a.wins}/{a.closedTrades}
        </span>
        <span
          className="w-14 shrink-0 text-right text-xs tabular-nums"
          style={{ color: avg >= 0 ? "var(--sage)" : "var(--danger)" }}
        >
          {fmtPct(avg)}
        </span>
      </div>
    </div>
  );
}
