import type { PortfolioView } from "@/lib/dashboard-v2";
import { fmtUsd, fmtPct } from "@/lib/format";

export function PortfolioCard({ pf }: { pf: PortfolioView }) {
  const ret = pf.totalReturnPct;
  const retColor = ret >= 0 ? "var(--sage)" : "var(--danger)";
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide faint">Portfolio</h2>
        <span className="chip">{pf.paperMode ? "paper" : "live"}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Value" value={fmtUsd(pf.nav)} />
        <Stat label="Total return" value={fmtPct(ret)} color={retColor} />
        <Stat label="Cash" value={fmtUsd(pf.cash)} />
        <Stat label="Deployed" value={fmtUsd(pf.deployed)} />
        <Stat
          label="Realized P&L"
          value={fmtUsd(pf.realizedPnl)}
          color={pf.realizedPnl >= 0 ? "var(--sage)" : "var(--danger)"}
        />
      </div>

      {pf.positions.length === 0 ? (
        <p className="mt-4 text-sm faint">
          No positions yet — nothing has been bought. That&apos;s expected until the brain finds a
          convergence it likes.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide faint">
                <th className="pb-2 font-medium">Ticker</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Avg</th>
                <th className="pb-2 text-right font-medium">Last</th>
                <th className="pb-2 text-right font-medium">Value</th>
                <th className="pb-2 text-right font-medium">P&amp;L</th>
                <th className="pb-2 text-right font-medium">Peak</th>
              </tr>
            </thead>
            <tbody>
              {pf.positions.map((p) => (
                <tr key={p.ticker} className="border-t border-[var(--border)]">
                  <td className="py-2 font-medium">{p.ticker}</td>
                  <td className="py-2 text-right tabular-nums muted">{p.qty}</td>
                  <td className="py-2 text-right tabular-nums muted">${p.avgPrice}</td>
                  <td className="py-2 text-right tabular-nums muted">${p.lastPrice}</td>
                  <td className="py-2 text-right tabular-nums">{fmtUsd(p.marketValue)}</td>
                  <td
                    className="py-2 text-right tabular-nums"
                    style={{ color: p.unrealizedPct >= 0 ? "var(--sage)" : "var(--danger)" }}
                  >
                    {fmtPct(p.unrealizedPct)}
                  </td>
                  <td
                    className="py-2 text-right text-xs tabular-nums"
                    style={p.drawdownFromPeakPct > 0.15 ? { color: "var(--danger)" } : undefined}
                  >
                    <span className={p.drawdownFromPeakPct > 0.15 ? "" : "faint"}>
                      {p.drawdownFromPeakPct > 0 ? `${fmtPct(-p.drawdownFromPeakPct)} from peak` : "at peak"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide faint">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
