"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StrategyConfig, SourceProvider } from "@/strategy.config";

const PROVIDERS: SourceProvider[] = ["seed", "house-stock-watcher", "senate-stock-watcher", "finnhub"];

export function SettingsForm({ initial }: { initial: StrategyConfig }) {
  const router = useRouter();
  const [c, setC] = useState<StrategyConfig>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) {
    setC((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      window.dispatchEvent(new CustomEvent("cg-toast", { detail: { type: "ok", msg: "Settings saved" } }));
      router.refresh();
    } catch (e) {
      window.dispatchEvent(new CustomEvent("cg-toast", { detail: { type: "error", msg: String(e) } }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode */}
      <Card title="Trading mode" desc="PAPER simulates via review_equity_order and logs paper_trades. LIVE allows real orders — still confirm-gated in Claude Code.">
        <label className="flex cursor-pointer items-center gap-3">
          <button
            type="button"
            onClick={() => set("paperMode", !c.paperMode)}
            className={`relative h-6 w-11 rounded-full transition-colors ${c.paperMode ? "bg-amber-500/70" : "bg-rose-600"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${c.paperMode ? "left-0.5" : "left-[22px]"}`} />
          </button>
          <span className="text-sm font-medium">{c.paperMode ? "PAPER (safe default)" : "LIVE — real money"}</span>
        </label>
      </Card>

      {/* Sizing + caps */}
      <Card title="Sizing & caps" desc="Hard limits. Cards pre-fill the default size; cap breaches are flagged before you approve.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Num label="Default $/trade" value={c.sizing.dollarsPerTrade} onChange={(v) => set("sizing", { ...c.sizing, dollarsPerTrade: v })} />
          <Num label="Max $/trade" value={c.caps.maxPerTrade} onChange={(v) => set("caps", { ...c.caps, maxPerTrade: v })} />
          <Num label="Max total deployed" value={c.caps.maxTotalDeployed} onChange={(v) => set("caps", { ...c.caps, maxTotalDeployed: v })} />
          <Num label="Max % per position" value={c.caps.maxPctPerPosition} step={0.01} onChange={(v) => set("caps", { ...c.caps, maxPctPerPosition: v })} />
        </div>
      </Card>

      {/* Risk */}
      <Card title="Risk controls" desc="Freshness colors the badges and drops absurdly stale filings on sync. The drawdown halt stops new buys.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Num label="Green ≤ days" value={c.freshness.greenMaxDays} onChange={(v) => set("freshness", { ...c.freshness, greenMaxDays: v })} />
          <Num label="Amber ≤ days" value={c.freshness.amberMaxDays} onChange={(v) => set("freshness", { ...c.freshness, amberMaxDays: v })} />
          <Num label="Drop > days" value={c.freshness.absurdStaleDays} onChange={(v) => set("freshness", { ...c.freshness, absurdStaleDays: v })} />
          <Num label="Drawdown halt %" value={c.drawdownHaltPct} onChange={(v) => set("drawdownHaltPct", v)} />
          <Num label="Stop loss % (0=off)" value={c.exits.stopLossPct} onChange={(v) => set("exits", { ...c.exits, stopLossPct: v })} />
          <Num label="Take profit % (0=off)" value={c.exits.takeProfitPct} onChange={(v) => set("exits", { ...c.exits, takeProfitPct: v })} />
        </div>
      </Card>

      {/* Source */}
      <Card title="Data source" desc="seed works offline. Live sources fetch public stock-watcher JSON; keys read from .env, never stored here.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1 text-[11px] uppercase text-zinc-500">Provider</div>
            <select
              value={c.source.provider}
              onChange={(e) => set("source", { ...c.source, provider: e.target.value as SourceProvider })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-500"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="mb-1 text-[11px] uppercase text-zinc-500">Override URL (optional)</div>
            <input
              value={c.source.url}
              onChange={(e) => set("source", { ...c.source, url: e.target.value })}
              placeholder="adapter default"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </label>
        </div>
        <label className="mt-4 block text-sm">
          <div className="mb-1 text-[11px] uppercase text-zinc-500">Members to follow (comma-separated; empty = all)</div>
          <input
            value={c.membersToFollow.join(", ")}
            onChange={(e) => set("membersToFollow", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="Nancy Pelosi, Tommy Tuberville"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-500"
          />
        </label>
      </Card>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-1 text-sm font-medium text-zinc-200">{title}</div>
      <div className="mb-3 text-xs text-zinc-500">{desc}</div>
      {children}
    </div>
  );
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-[11px] uppercase text-zinc-500">{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-500"
      />
    </label>
  );
}
