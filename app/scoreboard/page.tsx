import { BaselineChart } from "@/components/BaselineChart";
import { getBaselineView } from "@/lib/baselines";
import { fmtPct, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ScoreboardPage() {
  const bl = await getBaselineView();
  const { llm, spy, naive } = bl.returns;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Scoreboard</h1>
        <p className="mt-1 text-sm muted">
          The honest answer to &quot;is this working?&quot; — Claude&apos;s portfolio against the S&amp;P 500
          and against a dumb, equal-weight version of the same convergence signal. If Claude can&apos;t beat
          the naive basket, the reasoning isn&apos;t adding anything.
        </p>
      </section>

      {/* Blunt headline. */}
      <div className="card p-6">
        {bl.vsSpy == null ? (
          <p className="text-sm faint">
            Not enough history yet. Once the daily baseline snapshots accumulate, the P&amp;L comparison
            shows up here.
          </p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className="text-3xl font-semibold tabular-nums"
              style={{ color: bl.vsSpy >= 0 ? "var(--sage)" : "var(--danger)" }}
            >
              {fmtPct(bl.vsSpy)}
            </span>
            <span className="text-sm muted">vs SPY{bl.vsSpy >= 0 ? " — ahead" : " — behind"}</span>
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Claude" value={llm} color="var(--accent)" cap={bl.startingCapital} />
          <Stat label="SPY" value={spy} color="var(--sky)" cap={bl.startingCapital} />
          <Stat label="Naive basket" value={naive} color="var(--sage)" cap={bl.startingCapital} />
        </div>
      </div>

      {bl.hasData && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide faint">
            Three-way: same {fmtUsd(bl.startingCapital)} starting capital
          </h2>
          <BaselineChart series={bl.series} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, cap }: { label: string; value: number | null; color: string; cap: number }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide faint">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} /> {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value == null ? "—" : fmtPct(value)}</div>
      <div className="text-xs faint">{value == null ? `from ${fmtUsd(cap)}` : ""}</div>
    </div>
  );
}
