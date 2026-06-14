"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface OnboardingState {
  mcpConnected: boolean; // manual ack
  funded: boolean; // manual ack
  capsSet: boolean; // settings row persisted
  paperConfirmed: boolean; // cfg.paperMode === true
}

const LABELS: { key: keyof OnboardingState; title: string; detail: string; manual: boolean }[] = [
  { key: "mcpConnected", title: "Connect the Robinhood Trading MCP", detail: "Set it up in Claude Code (desktop). This app never talks to your brokerage directly.", manual: true },
  { key: "funded", title: "Fund the trading account", detail: "The funded balance is your max loss. Start tiny.", manual: true },
  { key: "capsSet", title: "Set your caps", detail: "Per-trade, total deployed, % per position — in Settings.", manual: false },
  { key: "paperConfirmed", title: "Confirm PAPER mode", detail: "Defaults on. Nothing real fires until you flip it in Settings.", manual: false },
];

export function Onboarding({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const [local, setLocal] = useState(state);
  const done = Object.values(local).every(Boolean);
  const [dismissed, setDismissed] = useState(false);

  async function ack(key: keyof OnboardingState) {
    const value = !local[key];
    setLocal((s) => ({ ...s, [key]: value }));
    await fetch("/api/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `ack_${key}`, value }),
    }).catch(() => {});
    router.refresh();
  }

  if (done || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <span className="text-sm font-medium text-zinc-200">First-run checklist</span>
          <button onClick={() => setDismissed(true)} className="text-xs text-zinc-500 hover:text-zinc-300">
            dismiss
          </button>
        </div>
        <ul className="divide-y divide-zinc-800/70">
          {LABELS.map((item) => {
            const checked = local[item.key];
            return (
              <li key={item.key} className="flex items-start gap-3 px-4 py-3">
                <button
                  onClick={() => item.manual && ack(item.key)}
                  disabled={!item.manual}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                    checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-600 text-transparent"
                  } ${item.manual ? "cursor-pointer hover:border-emerald-500" : "cursor-default"}`}
                  title={item.manual ? "Mark done" : "Auto-detected"}
                >
                  ✓
                </button>
                <div>
                  <div className={`text-sm ${checked ? "text-zinc-400 line-through" : "text-zinc-200"}`}>{item.title}</div>
                  <div className="text-xs text-zinc-500">{item.detail}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}
