"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function sync() {
    setBusy(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) window.dispatchEvent(new CustomEvent("cg-toast", { detail: { type: "error", msg: `Sync failed: ${data.error}` } }));
      else
        window.dispatchEvent(
          new CustomEvent("cg-toast", { detail: { type: "ok", msg: `Synced: +${data.inserted} new (${data.source})` } }),
        );
      startTransition(() => router.refresh());
    } catch (e) {
      window.dispatchEvent(new CustomEvent("cg-toast", { detail: { type: "error", msg: String(e) } }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={sync}
      disabled={busy}
      className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
    >
      {busy ? "syncing…" : "sync now"}
    </button>
  );
}
