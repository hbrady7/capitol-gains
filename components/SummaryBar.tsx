import { getPortfolio } from "@/lib/portfolio";
import { getLastSynced } from "@/lib/sync";
import { getConfig } from "@/lib/settings";
import { fmtUsd, timeAgo } from "@/lib/format";
import { SyncButton } from "./SyncButton";

export async function SummaryBar() {
  const [pf, lastSynced, cfg] = await Promise.all([getPortfolio(), getLastSynced(), getConfig()]);
  const pnl = pf.todayPnl;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-zinc-800/60 py-2 text-xs text-zinc-400">
      <Mode paper={cfg.paperMode} />
      <span>
        Account: <strong className="text-zinc-200">{pf.accountValue != null ? fmtUsd(pf.accountValue) : "—"}</strong>
      </span>
      <span>
        Cash: <strong className="text-zinc-200">{pf.cash != null ? fmtUsd(pf.cash) : "—"}</strong>
      </span>
      <span>
        Today:{" "}
        <strong className={pnl == null ? "text-zinc-200" : pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
          {pnl == null ? "—" : `${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)}`}
        </strong>
      </span>
      <span>
        Deployed: <strong className="text-zinc-200">{fmtUsd(pf.totalDeployed)}</strong>
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span>synced {timeAgo(lastSynced)}</span>
        <SyncButton />
      </span>
    </div>
  );
}

function Mode({ paper }: { paper: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        paper ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/20 text-rose-300"
      }`}
      title={paper ? "Paper mode — nothing real fires" : "LIVE mode — real orders possible (still confirm-gated)"}
    >
      {paper ? "PAPER" : "LIVE"}
    </span>
  );
}
