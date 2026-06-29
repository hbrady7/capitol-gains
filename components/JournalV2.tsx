"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { fmtUsd } from "@/lib/format";

export interface JournalDecision {
  date: string;
  action: string;
  ticker: string;
  size: number;
  confidence: number | null;
  outcome: string | null;
  reason: string | null;
  mode: string;
}
export interface JournalFill {
  date: string;
  ticker: string;
  side: string;
  qty: number;
  price: number;
  dollars: number;
  status: string;
}

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function JournalV2({ decisions, fills }: { decisions: JournalDecision[]; fills: JournalFill[] }) {
  const [tab, setTab] = useState<"decisions" | "fills">("decisions");
  const rows = tab === "decisions" ? decisions : fills;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className={`btn ${tab === "decisions" ? "btn-accent" : ""}`} onClick={() => setTab("decisions")}>
          Decisions ({decisions.length})
        </button>
        <button className={`btn ${tab === "fills" ? "btn-accent" : ""}`} onClick={() => setTab("fills")}>
          Fills ({fills.length})
        </button>
        <button
          className="btn ml-auto inline-flex items-center gap-1.5"
          onClick={() => downloadCsv(`capitol-gains-${tab}.csv`, rows as unknown as Record<string, unknown>[])}
          disabled={rows.length === 0}
        >
          <Download size={14} /> CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm faint">
          Nothing recorded yet. {tab === "decisions" ? "Decisions" : "Fills"} appear here after the brain runs.
        </div>
      ) : tab === "decisions" ? (
        <div className="card overflow-x-auto p-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide faint">
                <Th>Date</Th><Th>Action</Th><Th>Ticker</Th><Th right>Size</Th><Th right>Conf</Th><Th>Outcome</Th><Th>Mode</Th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <Td>{d.date}</Td>
                  <Td>{d.action}</Td>
                  <Td bold>{d.ticker || "—"}</Td>
                  <Td right>{d.size ? fmtUsd(d.size) : "—"}</Td>
                  <Td right>{d.confidence != null ? `${Math.round(d.confidence * 100)}%` : "—"}</Td>
                  <Td>
                    <OutcomeChip outcome={d.outcome} />
                  </Td>
                  <Td>{d.mode}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto p-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide faint">
                <Th>Date</Th><Th>Ticker</Th><Th>Side</Th><Th right>Qty</Th><Th right>Price</Th><Th right>Value</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {fills.map((f, i) => (
                <tr key={i} className="border-t border-[var(--border)]">
                  <Td>{f.date}</Td>
                  <Td bold>{f.ticker}</Td>
                  <Td>{f.side}</Td>
                  <Td right>{f.qty}</Td>
                  <Td right>${f.price}</Td>
                  <Td right>{fmtUsd(f.dollars)}</Td>
                  <Td>{f.status}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-medium ${right ? "text-right" : ""}`}>{children}</th>;
}
function Td({ children, right, bold }: { children: React.ReactNode; right?: boolean; bold?: boolean }) {
  return <td className={`px-3 py-2 ${right ? "text-right tabular-nums" : ""} ${bold ? "font-medium" : "muted"}`}>{children}</td>;
}
function OutcomeChip({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="faint">—</span>;
  const color =
    outcome === "placed" ? "var(--sage)" : outcome === "trimmed" ? "var(--accent)" : "var(--danger)";
  return <span style={{ color }}>{outcome}</span>;
}
