"use client";
import { useState } from "react";
import type { RunConfig } from "@/lib/config";
import { Power, ShieldOff, AlertTriangle, LogOut, Gauge } from "lucide-react";

/** Reassuring, clearly-labeled controls that write straight to the config table. */
export function ControlPanel({ initial }: { initial: RunConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function patch(p: Partial<RunConfig>) {
    setSaving(true);
    setCfg((c) => ({ ...c, ...p }));
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (res.ok) {
        const next = (await res.json()) as RunConfig;
        setCfg(next);
        setSavedAt(new Date().toLocaleTimeString());
        window.dispatchEvent(new CustomEvent("cg-toast", { detail: { type: "ok", msg: "Saved" } }));
      }
    } finally {
      setSaving(false);
    }
  }

  const num = (k: keyof RunConfig, label: string, hint: string, step = 1) => (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span>
        <span className="text-sm">{label}</span>
        <span className="block text-xs faint">{hint}</span>
      </span>
      <input
        type="number"
        step={step}
        defaultValue={Number(cfg[k])}
        onBlur={(e) => patch({ [k]: Number(e.target.value) } as Partial<RunConfig>)}
        className="w-28 rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-1.5 text-right text-sm tabular-nums"
      />
    </label>
  );

  return (
    <div className="space-y-5">
      {/* Big toggles. */}
      <div className="card p-5">
        <Toggle
          on={!cfg.killSwitch}
          onLabel="Trading is live-eligible"
          offLabel="Kill switch is ON — everything is halted"
          icon={cfg.killSwitch ? <ShieldOff size={18} /> : <Power size={18} />}
          danger={cfg.killSwitch}
          onToggle={() => patch({ killSwitch: !cfg.killSwitch })}
          hint="The master stop. When on, no orders are placed — the drawdown breaker flips this automatically."
          invert
        />
        <div className="my-3 border-t border-[var(--border)]" />
        <Toggle
          on={cfg.paperMode}
          onLabel="Paper mode (simulated, safe)"
          offLabel="LIVE mode — real orders"
          icon={<AlertTriangle size={18} />}
          danger={!cfg.paperMode}
          onToggle={() => patch({ paperMode: !cfg.paperMode })}
          hint="Paper simulates fills and places nothing real. Only switch to live deliberately."
        />
      </div>

      {/* Caps. */}
      <div className="card p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide faint">Limits</h3>
        <div className="divide-y divide-[var(--border)]">
          {num("maxPerPosition", "Max per position", "Most that can go into one name ($)", 25)}
          {num("maxPerDay", "Max per day", "Most that can be deployed in a day ($)", 25)}
          {num("maxOpenPositions", "Max open positions", "How many names at once")}
          {num("drawdownHaltPct", "Drawdown halt", "Trip the kill switch if down this % from the high", 1)}
          {num("cooldownDays", "Cooldown days", "Don't re-buy a name within this many days")}
        </div>
      </div>

      {/* Exit desk. */}
      <div className="card p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide faint">Exit desk</h3>
        <div className="divide-y divide-[var(--border)]">
          <div className="py-2.5">
            <Toggle
              on={cfg.exitsEnabled}
              onLabel="Exit desk enabled"
              offLabel="Exit desk off — positions aren't reviewed for exit"
              icon={<LogOut size={18} />}
              danger={false}
              onToggle={() => patch({ exitsEnabled: !cfg.exitsEnabled })}
              hint="When on, open positions are reviewed each run for stops, take-profit, and thesis decay."
            />
          </div>
          <div className="py-2.5">
            <Toggle
              on={cfg.confidenceSizing}
              onLabel="Confidence sizing enabled"
              offLabel="Confidence sizing off — flat sizing"
              icon={<Gauge size={18} />}
              danger={false}
              onToggle={() => patch({ confidenceSizing: !cfg.confidenceSizing })}
              hint="Scale each buy by the model's stated confidence (still capped by the limits above)."
            />
          </div>
          {num("trailingStopPct", "Trailing stop", "Exit if down this % from the position's peak", 1)}
          {num("hardStopPct", "Hard stop", "Exit if down this % from entry", 1)}
          {num("takeProfitPct", "Take profit", "Exit if up this % from entry (0 = off)", 1)}
          {num("maxHoldDays", "Max hold days", "Exit a position after this many days")}
        </div>
      </div>

      {/* Signal tunables. */}
      <div className="card p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide faint">Signal</h3>
        <div className="divide-y divide-[var(--border)]">
          {num("lookbackDays", "Lookback days", "Window of buys the score considers")}
          {num("freshnessCutoffDays", "Freshness cutoff", "Drop trades older than this (combats disclosure lag)")}
          {num("kConverge", "Convergence weight (k)", "How much the both-buying bonus matters", 0.1)}
          {num("wCong", "Congress weight", "Relative weight of the political signal", 0.1)}
          {num("wIns", "Insider weight", "Relative weight of the insider signal", 0.1)}
        </div>
      </div>

      <p className="text-xs faint">
        {saving ? "Saving…" : savedAt ? `Saved at ${savedAt}. Changes take effect on the next run.` : "Changes save on blur and take effect on the next run."}
      </p>
    </div>
  );
}

function Toggle({
  on,
  onLabel,
  offLabel,
  hint,
  icon,
  danger,
  onToggle,
  invert,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  hint: string;
  icon: React.ReactNode;
  danger?: boolean;
  onToggle: () => void;
  invert?: boolean;
}) {
  // `invert` means the switch's "on" position represents the safe state.
  const switchOn = invert ? on : on;
  return (
    <div className="flex items-start gap-3">
      <span style={{ color: danger ? "var(--danger)" : "var(--sage)" }}>{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-medium" style={danger ? { color: "var(--danger)" } : undefined}>
          {on ? onLabel : offLabel}
        </div>
        <div className="text-xs faint">{hint}</div>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={switchOn}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: switchOn ? "var(--sage)" : "var(--border)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: switchOn ? "1.5rem" : "0.125rem" }}
        />
      </button>
    </div>
  );
}
