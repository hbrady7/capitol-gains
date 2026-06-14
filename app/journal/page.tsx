import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { paperTrades, trades } from "@/lib/schema";
import { JournalTable, type JournalRow } from "@/components/JournalTable";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  let rows: JournalRow[] = [];
  try {
    const [paper, live] = await Promise.all([
      db.select().from(paperTrades).orderBy(desc(paperTrades.ts)),
      db.select().from(trades).orderBy(desc(trades.ts)),
    ]);
    rows = [
      ...paper.map((r) => ({
        kind: "paper" as const,
        ticker: r.ticker,
        side: r.side,
        qty: r.qty,
        price: r.simPrice,
        status: "simulated",
        ts: new Date(r.ts).toISOString(),
      })),
      ...live.map((r) => ({
        kind: "live" as const,
        ticker: r.ticker,
        side: r.side,
        qty: r.qty,
        price: r.fillPrice,
        status: r.status,
        ts: new Date(r.ts).toISOString(),
      })),
    ].sort((a, b) => b.ts.localeCompare(a.ts));
  } catch {
    rows = [];
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Trade journal</h1>
        <p className="mt-1 text-sm text-zinc-500">Every recorded fill (paper + live). Filter and export to CSV for taxes and review.</p>
      </div>
      <JournalTable rows={rows} />
    </div>
  );
}
