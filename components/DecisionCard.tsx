import type { DecisionRow } from "@/lib/dashboard-v2";
import { fmtUsd } from "@/lib/format";
import { Brain, ShieldCheck, ShieldAlert, Scissors, PauseCircle } from "lucide-react";

/** The centerpiece — "Why I bought this" rendered as a readable narrative. */
export function DecisionCard({ decision }: { decision: DecisionRow | null }) {
  if (!decision) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 text-sm muted">
          <Brain size={16} /> The brain hasn&apos;t run yet
        </div>
        <p className="mt-2 text-sm faint">
          Once the daily pipeline runs (ingest → score → decide), Claude&apos;s latest call and the
          reasoning behind it show up here.
        </p>
      </div>
    );
  }

  const isBuy = decision.action === "buy" && decision.selectedTicker;
  const paras = (decision.reasoning ?? "").split(/\n{2,}/).filter((p) => p.trim());

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <Brain size={18} className="link-accent" />
        <h2 className="text-base font-semibold">Why Claude {isBuy ? "wants to buy" : "is holding"}</h2>
        {isBuy ? (
          <span
            className="chip"
            style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}
          >
            BUY {decision.selectedTicker}
          </span>
        ) : (
          <span className="chip">
            <PauseCircle size={13} /> HOLD
          </span>
        )}
        {isBuy && (
          <span className="chip">{fmtUsd(decision.finalDollarSize ?? decision.dollarSize)}</span>
        )}
        {decision.confidence != null && (
          <span className="chip">confidence {Math.round(decision.confidence * 100)}%</span>
        )}
        <span className="ml-auto text-xs faint">
          {decision.mode} · {new Date(decision.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          {decision.thesis && (
            <Section label="The thesis">
              <p className="text-sm leading-relaxed">{decision.thesis}</p>
            </Section>
          )}
          {paras.length > 0 && (
            <Section label="The reasoning">
              <div className="space-y-3 text-sm leading-relaxed muted">
                {paras.map((p, i) =>
                  p.startsWith("---") ? (
                    <p key={i} className="pt-1 text-xs uppercase tracking-wide faint">
                      {p.replace(/-/g, "").trim()}
                    </p>
                  ) : (
                    <p key={i}>{p}</p>
                  ),
                )}
              </div>
            </Section>
          )}
        </div>

        <div className="space-y-4">
          {decision.risks && (
            <Section label="Key risks">
              <p className="text-sm leading-relaxed muted">{decision.risks}</p>
            </Section>
          )}
          <Section label="Safety check">
            <GuardrailBadge outcome={decision.guardrailOutcome} reason={decision.guardrailReason} />
          </Section>
          {decision.model && decision.model !== "none" && (
            <p className="text-xs faint">decided by {decision.model}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide faint">{label}</div>
      {children}
    </div>
  );
}

function GuardrailBadge({ outcome, reason }: { outcome: string | null; reason: string | null }) {
  const map: Record<string, { icon: React.ReactNode; color: string }> = {
    placed: { icon: <ShieldCheck size={14} />, color: "var(--sage)" },
    trimmed: { icon: <Scissors size={14} />, color: "var(--accent)" },
    blocked: { icon: <ShieldAlert size={14} />, color: "var(--danger)" },
  };
  const m = outcome ? map[outcome] : null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: m?.color ?? "var(--muted)" }}>
        {m?.icon} {outcome ? outcome[0].toUpperCase() + outcome.slice(1) : "Pending"}
      </div>
      {reason && <p className="mt-1 text-xs faint">{reason}</p>}
    </div>
  );
}
