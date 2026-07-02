import type { DecisionRow } from "@/lib/dashboard-v2";
import { fmtUsd } from "@/lib/format";
import { DoorOpen } from "lucide-react";

interface ExitTrigger {
  type: string;
  severity?: string;
  detail?: string;
}

const OUTCOME_COLOR: Record<string, string> = {
  placed: "var(--sage)",
  trimmed: "var(--accent)",
  blocked: "var(--danger)",
};

/** A compact secondary strip on Today — recent exit-desk decisions. */
export function ExitDeskStrip({ exits }: { exits: DecisionRow[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <DoorOpen size={16} className="link-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wide faint">Exit desk</h2>
      </div>

      {exits.length === 0 ? (
        <p className="mt-3 text-sm faint">
          No exits yet — positions are held until the thesis decays or a stop trips.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {exits.map((e) => (
            <ExitRow key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExitRow({ e }: { e: DecisionRow }) {
  const isSell = e.action === "sell";
  const triggers = (e.exitTriggers as ExitTrigger[] | null) ?? [];
  const line = e.reasoning ?? e.thesis ?? "";
  const outcomeColor = e.guardrailOutcome ? OUTCOME_COLOR[e.guardrailOutcome] : null;

  return (
    <div className="border-t border-[var(--border)] pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{e.selectedTicker ?? "—"}</span>
        <span
          className="chip"
          style={
            isSell
              ? { background: "var(--danger-soft)", color: "var(--danger)", borderColor: "transparent" }
              : undefined
          }
        >
          {e.action}
        </span>
        {e.guardrailOutcome && (
          <span className="text-xs font-medium" style={{ color: outcomeColor ?? "var(--muted)" }}>
            {e.guardrailOutcome}
          </span>
        )}
        {e.realizedPnl != null && (
          <span
            className="text-xs tabular-nums"
            style={{ color: e.realizedPnl >= 0 ? "var(--sage)" : "var(--danger)" }}
          >
            {fmtUsd(e.realizedPnl)}
          </span>
        )}
        {triggers.map((t, i) => (
          <span key={i} className="chip" title={t.detail ?? undefined}>
            {t.type}
          </span>
        ))}
        <span className="ml-auto text-xs faint">{new Date(e.createdAt).toLocaleDateString()}</span>
      </div>
      {line && <p className="mt-1 truncate text-xs muted">{line}</p>}
    </div>
  );
}
