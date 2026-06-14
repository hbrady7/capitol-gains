import { getPortfolio } from "@/lib/portfolio";
import { fmtPct, fmtUsd } from "@/lib/format";

export async function PortfolioPanel() {
  const pf = await getPortfolio();

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <span className="text-sm font-medium text-zinc-200">Portfolio</span>
        <span className="text-[11px] text-zinc-500">{pf.paperMode ? "paper" : "live"}</span>
      </div>
      {!pf.connected ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-500">
          No fills recorded yet. Once Claude Code places (or paper-simulates) a trade through the Robinhood MCP, your
          positions show up here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Ticker</th>
                <th className="px-4 py-2 font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">Cost</th>
                <th className="px-4 py-2 font-medium">Last</th>
                <th className="px-4 py-2 font-medium">Value</th>
                <th className="px-4 py-2 font-medium">P&amp;L</th>
                <th className="px-4 py-2 font-medium">Alloc</th>
              </tr>
            </thead>
            <tbody>
              {pf.positions.map((p) => (
                <tr key={p.ticker} className="border-t border-zinc-800/70">
                  <td className="px-4 py-2 font-medium">{p.ticker}</td>
                  <td className="px-4 py-2 text-zinc-400">{p.qty}</td>
                  <td className="px-4 py-2 text-zinc-400">{fmtUsd(p.costBasis, 2)}</td>
                  <td className="px-4 py-2 text-zinc-400">{fmtUsd(p.lastPrice, 2)}</td>
                  <td className="px-4 py-2">{fmtUsd(p.marketValue, 0)}</td>
                  <td className={`px-4 py-2 ${p.unrealizedPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmtPct(p.unrealizedPct)}
                  </td>
                  <td className="px-4 py-2 text-zinc-400">{(p.allocationPct * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
