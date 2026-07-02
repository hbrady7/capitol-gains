import type { CandidateView } from "@/lib/dashboard-v2";
import { Landmark, Briefcase, Sparkles, FileText, Megaphone, Gavel } from "lucide-react";

interface CatalystChip {
  kind: string;
  direction: string;
  weight: number;
  headline: string;
  date: string;
}
type CatalystMap = Record<string, CatalystChip[]>;

/** The convergence leaderboard — each candidate's decomposed CCS shown visually
 *  (congress vs insider vs the convergence bonus) plus the supporting evidence. */
export function CandidateLeaderboard({
  candidates,
  catalysts,
}: {
  candidates: CandidateView[];
  catalysts?: CatalystMap;
}) {
  if (candidates.length === 0) {
    return (
      <div className="card p-6 text-sm faint">
        No candidates scored yet. Run the daily pipeline and the convergence leaderboard fills in here —
        the names where politicians and corporate insiders are buying the same stock.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {candidates.map((c) => (
        <CandidateRow key={c.ticker} c={c} catalysts={catalysts?.[c.ticker]} />
      ))}
    </div>
  );
}

function CandidateRow({ c, catalysts }: { c: CandidateView; catalysts?: CatalystChip[] }) {
  const bonusPct = Math.round((c.convergenceMult - 1) * 100);
  const both = c.congNorm > 0 && c.insNorm > 0;
  const members = c.evidence.congress ?? [];
  const insiders = c.evidence.insiders ?? [];
  const committees = c.evidence.committeesMatched ?? [];

  return (
    <div className="card card-hover p-4 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-6 text-center text-sm faint">{c.rank}</div>
        <div className="text-lg font-semibold tracking-tight">{c.ticker}</div>
        {both && (
          <span
            className="chip"
            style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}
            title="Both populations are buying — the convergence bonus"
          >
            <Sparkles size={12} /> convergence +{bonusPct}%
          </span>
        )}
        <div className="ml-auto text-right">
          <div className="text-lg font-semibold tabular-nums">{c.ccs.toFixed(2)}</div>
          <div className="text-[10px] uppercase tracking-wide faint">CCS</div>
        </div>
      </div>

      {/* Decomposed bars: congress (sky) + insider (sage). */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <ScoreBar
          label="Congress"
          icon={<Landmark size={12} />}
          value={c.congNorm}
          color="var(--sky)"
          detail={`${c.evidence.distinctMembers ?? members.length} member${(c.evidence.distinctMembers ?? members.length) === 1 ? "" : "s"}`}
        />
        <ScoreBar
          label="Insiders"
          icon={<Briefcase size={12} />}
          value={c.insNorm}
          color="var(--sage)"
          detail={`${c.evidence.distinctInsiders ?? insiders.length} insider${(c.evidence.distinctInsiders ?? insiders.length) === 1 ? "" : "s"}`}
        />
      </div>

      {/* Evidence line. */}
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {members.slice(0, 3).map((m, i) => (
          <span key={`m${i}`} className="chip" title={`$${m.amountMid.toLocaleString()} · ${m.date}`}>
            <Landmark size={11} /> {m.member}
          </span>
        ))}
        {insiders.slice(0, 3).map((m, i) => (
          <span key={`i${i}`} className="chip" title={`$${m.dollarValue.toLocaleString()} · ${m.date}`}>
            <Briefcase size={11} /> {m.name} <span className="faint">({m.role})</span>
          </span>
        ))}
        {committees.map((cm, i) => (
          <span
            key={`c${i}`}
            className="chip"
            style={{ background: "var(--sky-soft)", borderColor: "transparent", color: "var(--sky)" }}
            title="Buyer sits on a committee with jurisdiction over this sector"
          >
            {cm}
          </span>
        ))}
        {!c.liquidityOk && (
          <span className="chip" style={{ color: "var(--danger)" }}>
            illiquid
          </span>
        )}
        {(catalysts ?? []).map((cat, i) => (
          <CatalystChipView key={`cat${i}`} cat={cat} />
        ))}
      </div>
    </div>
  );
}

function CatalystChipView({ cat }: { cat: CatalystChip }) {
  const support = cat.direction === "support";
  const color = support ? "var(--sage)" : "var(--danger)";
  const bg = support ? "var(--sage-soft)" : "var(--danger-soft)";
  const icon =
    cat.kind === "contract" ? (
      <FileText size={11} />
    ) : cat.kind === "lobbying" ? (
      <Megaphone size={11} />
    ) : (
      <Gavel size={11} />
    );
  return (
    <span
      className="chip"
      style={{ background: bg, borderColor: "transparent", color }}
      title={`${cat.headline} · ${cat.date}`}
    >
      {icon} {cat.kind}
    </span>
  );
}

function ScoreBar({
  label,
  icon,
  value,
  color,
  detail,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  color: string;
  detail: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs muted">
        {icon} {label}
        <span className="ml-auto faint">{detail}</span>
      </div>
      <div className="bar-track h-2">
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
      </div>
    </div>
  );
}
