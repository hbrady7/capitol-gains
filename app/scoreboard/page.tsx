import { getScoreboard } from "@/lib/scoreboard";
import { ScoreboardChart } from "@/components/ScoreboardChart";
import { fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ScoreboardPage() {
  const s = await getScoreboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Scoreboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          The only question that matters: are you beating a boring index fund? Same cash, same dates.
        </p>
      </div>

      {/* Blunt headline */}
      <div
        className={`rounded-xl border p-5 ${
          s.vsSpyPct == null
            ? "border-zinc-800 bg-zinc-900/40"
            : s.vsSpyPct >= 0
              ? "border-emerald-700 bg-emerald-500/10"
              : "border-rose-800 bg-rose-500/10"
        }`}
      >
        <div className="text-xs uppercase tracking-wide text-zinc-500">vs just buying SPY</div>
        <div className={`mt-1 text-3xl font-bold ${s.vsSpyPct == null ? "text-zinc-400" : s.vsSpyPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {s.vsSpyPct == null ? "—" : fmtPct(s.vsSpyPct)}
        </div>
        {s.strategyReturnPct != null && s.spyReturnPct != null && (
          <div className="mt-1 text-xs text-zinc-500">
            bot {fmtPct(s.strategyReturnPct)} · SPY {fmtPct(s.spyReturnPct)}
          </div>
        )}
      </div>

      {!s.hasData ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center text-sm text-zinc-500">
          No performance history yet. Once Claude Code records fills and daily account snapshots through the Robinhood
          MCP, the bot-vs-SPY chart and stats populate here.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <ScoreboardChart data={s.series} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Win rate" value={s.winRate == null ? "—" : `${(s.winRate * 100).toFixed(0)}%`} />
            <Stat label="Avg hold" value={s.avgHoldDays == null ? "—" : `${s.avgHoldDays}d`} />
            <Stat label="Max drawdown" value={s.maxDrawdownPct == null ? "—" : `${(s.maxDrawdownPct * 100).toFixed(1)}%`} />
            <Stat label="Trades" value={String(s.tradeCount)} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}
