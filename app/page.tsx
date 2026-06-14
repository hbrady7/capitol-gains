import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { getReviewSignals, getBrief } from "@/lib/dashboard-data";
import { getConfig } from "@/lib/settings";
import { getMeta } from "@/lib/meta";
import { SignalReview } from "@/components/SignalReview";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { Onboarding, type OnboardingState } from "@/components/Onboarding";
import { fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

async function onboardingState(): Promise<OnboardingState> {
  const cfg = await getConfig();
  const acks = await getMeta(["ack_mcpConnected", "ack_funded"]);
  let capsSet = false;
  try {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(settings);
    capsSet = Number(row?.c ?? 0) > 0;
  } catch {
    capsSet = false;
  }
  return {
    mcpConnected: acks.ack_mcpConnected === "1",
    funded: acks.ack_funded === "1",
    capsSet,
    paperConfirmed: cfg.paperMode === true,
  };
}

export default async function ReviewPage() {
  const [{ signals, config }, brief, onboarding] = await Promise.all([
    getReviewSignals(),
    getBrief(),
    onboardingState(),
  ]);

  return (
    <div className="space-y-6">
      <Onboarding state={onboarding} />

      {/* Today's brief */}
      <section>
        <h1 className="text-lg font-semibold tracking-tight">Today&apos;s brief</h1>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Brief label="Signals" value={String(brief.total)} />
          <Brief label="Buys" value={String(brief.buys)} />
          <Brief label="Fresh buys (≤14d)" value={String(brief.fresh)} accent />
          <Brief label="Members" value={String(brief.uniqueMembers)} />
          <Brief label="Most bought" value={brief.topTicker ?? "—"} />
          <Brief label="Approved deployed" value={fmtUsd(brief.deployed)} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          The signal lags the actual trade by weeks. Freshness badges and a deployed-cap check are here to keep that
          obvious — approve deliberately.
        </p>
      </section>

      {/* Review queue */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Review queue</h2>
        <SignalReview initial={signals} config={config} />
      </section>

      {/* Portfolio */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Portfolio</h2>
        <PortfolioPanel />
      </section>
    </div>
  );
}

function Brief({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${accent ? "text-emerald-400" : "text-zinc-100"}`}>{value}</div>
    </div>
  );
}
