"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewSignal } from "@/lib/dashboard-data";
import type { StrategyConfig } from "@/strategy.config";
import { cn } from "@/lib/cn";
import { fmtBracket, fmtUsd } from "@/lib/format";

const FRESH_STYLE: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-700/50",
  amber: "bg-amber-500/15 text-amber-300 border-amber-700/50",
  red: "bg-rose-500/15 text-rose-300 border-rose-800/50",
};

export function SignalReview({ initial, config }: { initial: ReviewSignal[]; config: StrategyConfig }) {
  const router = useRouter();
  const [signals, setSignals] = useState(initial);
  const [cursor, setCursor] = useState(0);
  const [sizes, setSizes] = useState<Record<number, number>>(
    () => Object.fromEntries(initial.map((s) => [s.id, s.defaultSize])),
  );

  useEffect(() => {
    setSignals(initial);
    setSizes(Object.fromEntries(initial.map((s) => [s.id, s.defaultSize])));
  }, [initial]);

  // Running total of approved size, for live cap-breach flagging.
  const approvedDeployed = useMemo(
    () => signals.filter((s) => s.decided === "approved").reduce((sum, s) => sum + (sizes[s.id] ?? 0), 0),
    [signals, sizes],
  );

  const decide = useCallback(
    async (sig: ReviewSignal, action: "approve" | "skip" | "clear") => {
      const sizeDollars = sizes[sig.id] ?? sig.defaultSize;
      // optimistic
      setSignals((prev) =>
        prev.map((s) => (s.id === sig.id ? { ...s, decided: action === "clear" ? null : action === "skip" ? "skipped" : "approved" } : s)),
      );
      try {
        const res = await fetch("/api/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signalId: sig.id, action, sizeDollars, limitPrice: sig.suggestedLimit }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (action === "approve")
          window.dispatchEvent(new CustomEvent("cg-toast", { detail: { type: "ok", msg: `Approved ${sig.ticker} — ${fmtUsd(sizeDollars)}` } }));
        router.refresh();
      } catch (e) {
        window.dispatchEvent(new CustomEvent("cg-toast", { detail: { type: "error", msg: String(e) } }));
      }
    },
    [router, sizes],
  );

  // Keyboard: j/k move, a approve, s skip.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const list = signals;
      if (list.length === 0) return;
      if (e.key === "j") setCursor((c) => Math.min(c + 1, list.length - 1));
      else if (e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      else if (e.key === "a") void decide(list[cursor], "approve");
      else if (e.key === "s") void decide(list[cursor], "skip");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signals, cursor, decide]);

  if (signals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center">
        <p className="text-zinc-300">No signals yet.</p>
        <p className="mt-1 text-sm text-zinc-500">
          Hit <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">sync now</span> in the bar above, or run{" "}
          <code className="text-zinc-400">npm run sync</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          {signals.filter((s) => !s.decided).length} to review ·{" "}
          {signals.filter((s) => s.decided === "approved").length} approved
        </span>
        <span className="hidden sm:block">
          <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>a</Kbd> approve · <Kbd>s</Kbd> skip
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {signals.map((s, i) => {
            const size = sizes[s.id] ?? s.defaultSize;
            const wouldBreach =
              size > config.caps.maxPerTrade
                ? `over per-trade cap (${fmtUsd(config.caps.maxPerTrade)})`
                : s.decided !== "approved" && approvedDeployed + size > config.caps.maxTotalDeployed
                  ? `would exceed total deployed cap (${fmtUsd(config.caps.maxTotalDeployed)})`
                  : null;
            return (
              <motion.div
                layout
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-zinc-900/50 p-4 transition-colors",
                  i === cursor ? "border-zinc-600 ring-1 ring-zinc-600" : "border-zinc-800",
                  s.decided === "approved" && "ring-1 ring-emerald-600/60",
                  s.decided === "skipped" && "opacity-50",
                )}
              >
                {/* header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                      {s.member.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </div>
                    <div className="leading-tight">
                      <div className="text-sm font-medium text-zinc-100">{s.member}</div>
                      <div className="text-[11px] text-zinc-500">
                        {s.party ?? "—"} · {s.chamber ?? "—"}
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase",
                      s.side === "buy" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300",
                    )}
                  >
                    {s.side}
                  </span>
                </div>

                {/* ticker + amount */}
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xl font-semibold tracking-tight">{s.ticker}</span>
                  <span className="text-xs text-zinc-400">{fmtBracket(s.amountLow, s.amountHigh)}</span>
                </div>

                {/* badges */}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className={cn("rounded border px-1.5 py-0.5", FRESH_STYLE[s.freshness])}>
                    {s.daysStale}d stale
                  </span>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5",
                      s.liquidity === "liquid"
                        ? "border-sky-700/50 bg-sky-500/10 text-sky-300"
                        : "border-zinc-700 bg-zinc-800/60 text-zinc-400",
                    )}
                  >
                    {s.liquidity}
                  </span>
                  {s.histReturn != null && (
                    <span
                      className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-zinc-400"
                      title="Naive historical hint — not a prediction"
                    >
                      hist {s.histReturn >= 0 ? "+" : ""}
                      {(s.histReturn * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                {/* limit + size */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-zinc-800/40 px-2.5 py-1.5">
                    <div className="text-[10px] uppercase text-zinc-500">limit {s.syntheticPrice && "≈"}</div>
                    <div className="font-medium text-zinc-200">{s.suggestedLimit > 0 ? fmtUsd(s.suggestedLimit, 2) : "—"}</div>
                  </div>
                  <label className="rounded-lg bg-zinc-800/40 px-2.5 py-1.5">
                    <div className="text-[10px] uppercase text-zinc-500">size $</div>
                    <input
                      type="number"
                      value={size}
                      min={0}
                      step={50}
                      onChange={(e) => setSizes((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))}
                      className="w-full bg-transparent font-medium text-zinc-100 outline-none"
                    />
                  </label>
                </div>

                {wouldBreach && (
                  <div className="mt-2 rounded-md border border-amber-800/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                    ⚠ {wouldBreach}
                  </div>
                )}

                {/* actions */}
                <div className="mt-3 flex gap-2">
                  {s.decided === null ? (
                    <>
                      <button
                        onClick={() => decide(s, "approve")}
                        className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decide(s, "skip")}
                        className="flex-1 rounded-lg border border-zinc-700 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                      >
                        Skip
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => decide(s, "clear")}
                      className="flex-1 rounded-lg border border-zinc-700 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800"
                    >
                      {s.decided === "approved" ? "✓ Approved — undo" : "Skipped — undo"}
                    </button>
                  )}
                </div>

                {s.rawUrl && (
                  <a href={s.rawUrl} target="_blank" rel="noreferrer" className="mt-2 text-[11px] text-zinc-600 hover:text-zinc-400">
                    view filing ↗
                  </a>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{children}</kbd>;
}
