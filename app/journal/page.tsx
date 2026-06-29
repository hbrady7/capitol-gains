import { getRecentDecisions, getRecentFills } from "@/lib/dashboard-v2";
import { JournalV2, type JournalDecision, type JournalFill } from "@/components/JournalV2";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const [decisions, fills] = await Promise.all([getRecentDecisions(100), getRecentFills(100)]);

  const decisionRows: JournalDecision[] = decisions.map((d) => ({
    date: new Date(d.createdAt).toISOString().slice(0, 10),
    action: d.action,
    ticker: d.selectedTicker ?? "",
    size: d.finalDollarSize ?? d.dollarSize ?? 0,
    confidence: d.confidence,
    outcome: d.guardrailOutcome,
    reason: d.guardrailReason,
    mode: d.mode,
  }));
  const fillRows: JournalFill[] = fills.map((f) => ({
    date: new Date(f.ts).toISOString().slice(0, 10),
    ticker: f.ticker,
    side: f.side,
    qty: Number(f.qty.toFixed(4)),
    price: Number(f.price.toFixed(2)),
    dollars: Number(f.dollars.toFixed(2)),
    status: f.status,
  }));

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Journal</h1>
        <p className="mt-1 text-sm muted">
          Every decision the brain made and every fill it recorded — including the holds and the orders the
          safety layer trimmed or blocked. Export to CSV for review.
        </p>
      </section>
      <JournalV2 decisions={decisionRows} fills={fillRows} />
    </div>
  );
}
