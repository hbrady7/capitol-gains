"use client";

import { useMemo, useState } from "react";

export interface JournalRow {
  kind: "paper" | "live";
  ticker: string;
  side: string;
  qty: number;
  price: number | null;
  status: string;
  ts: string;
}

export function JournalTable({ rows }: { rows: JournalRow[] }) {
  const [kind, setKind] = useState<"all" | "paper" | "live">("all");
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (kind === "all" || r.kind === kind) &&
          (side === "all" || r.side === side) &&
          (q === "" || r.ticker.toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, kind, side, q],
  );

  function exportCsv() {
    const header = ["kind", "ticker", "side", "qty", "price", "status", "timestamp"];
    const lines = filtered.map((r) => [r.kind, r.ticker, r.side, r.qty, r.price ?? "", r.status, r.ts].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capitol-gains-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onChange={(v) => setKind(v as typeof kind)} options={["all", "paper", "live"]} />
        <Select value={side} onChange={(v) => setSide(v as typeof side)} options={["all", "buy", "sell"]} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter ticker…"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
        />
        <button
          onClick={exportCsv}
          className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          Export CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          No trades logged yet. Fills appear here after Claude Code executes (or paper-simulates) approved orders.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-[11px] uppercase text-zinc-500">
              <tr>
                <Th>When</Th><Th>Kind</Th><Th>Ticker</Th><Th>Side</Th><Th>Qty</Th><Th>Price</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-t border-zinc-800/70">
                  <Td>{new Date(r.ts).toLocaleString()}</Td>
                  <Td>{r.kind}</Td>
                  <Td className="font-medium">{r.ticker}</Td>
                  <Td className={r.side === "buy" ? "text-emerald-400" : "text-rose-400"}>{r.side}</Td>
                  <Td>{r.qty}</Td>
                  <Td>{r.price == null ? "—" : `$${r.price.toFixed(2)}`}</Td>
                  <Td>{r.status}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
