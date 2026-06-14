/** Server-side enrichment for the review dashboard. All defensive: empty DB and
 *  down feeds degrade to sensible, honest states — never a broken screen. */
import { desc, sql } from "drizzle-orm";
import { db } from "./db";
import { approved, signals } from "./schema";
import { getConfig } from "./settings";
import { getLastCloses } from "./quotes";
import type { StrategyConfig } from "../strategy.config";

// A small, honest large-cap liquidity heuristic (no real volume feed in core).
const LIQUID = new Set([
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "JPM", "UNH",
  "LLY", "XOM", "V", "MA", "HD", "COST", "WMT", "PG", "JNJ", "CRWD", "PANW",
]);

export type Freshness = "green" | "amber" | "red";

export interface ReviewSignal {
  id: number;
  member: string;
  party: string | null;
  chamber: string | null;
  ticker: string;
  side: "buy" | "sell";
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string;
  disclosureDate: string;
  daysStale: number;
  rawUrl: string | null;
  histReturn: number | null;
  freshness: Freshness;
  liquidity: "liquid" | "thin";
  suggestedLimit: number;
  syntheticPrice: boolean;
  defaultSize: number;
  capBreach: string | null; // human-readable reason or null
  decided: "approved" | "skipped" | null;
}

function freshnessOf(daysStale: number, cfg: StrategyConfig): Freshness {
  if (daysStale <= cfg.freshness.greenMaxDays) return "green";
  if (daysStale <= cfg.freshness.amberMaxDays) return "amber";
  return "red";
}

export async function getReviewSignals(limit = 60): Promise<{ signals: ReviewSignal[]; config: StrategyConfig }> {
  const cfg = await getConfig();
  let rows: typeof signals.$inferSelect[] = [];
  try {
    rows = await db.select().from(signals).orderBy(desc(signals.disclosureDate), desc(signals.id)).limit(limit);
  } catch {
    return { signals: [], config: cfg };
  }
  if (rows.length === 0) return { signals: [], config: cfg };

  const decided = new Map<number, "approved" | "skipped">();
  try {
    const ap = await db.select().from(approved);
    for (const a of ap) decided.set(a.signalId, a.status === "skipped" ? "skipped" : "approved");
  } catch {
    /* none */
  }

  const quotes = await getLastCloses(rows.map((r) => r.ticker));
  const defaultSize = cfg.sizing.dollarsPerTrade;

  const out: ReviewSignal[] = rows.map((r) => {
    const q = quotes[r.ticker] ?? { price: 0, synthetic: true };
    // Suggested limit = last close, nudged for marketability (buys slightly above).
    const limit = q.price > 0 ? Number((q.price * (r.side === "buy" ? 1.005 : 0.995)).toFixed(2)) : 0;
    let capBreach: string | null = null;
    if (defaultSize > cfg.caps.maxPerTrade) capBreach = `size ${defaultSize} > per-trade cap ${cfg.caps.maxPerTrade}`;
    return {
      id: r.id,
      member: r.member,
      party: r.party,
      chamber: r.chamber,
      ticker: r.ticker,
      side: r.side as "buy" | "sell",
      amountLow: r.amountLow,
      amountHigh: r.amountHigh,
      transactionDate: r.transactionDate,
      disclosureDate: r.disclosureDate,
      daysStale: r.daysStale,
      rawUrl: r.rawUrl,
      histReturn: r.histReturn,
      freshness: freshnessOf(r.daysStale, cfg),
      liquidity: LIQUID.has(r.ticker) ? "liquid" : "thin",
      suggestedLimit: limit,
      syntheticPrice: q.synthetic,
      defaultSize,
      capBreach,
      decided: decided.get(r.id) ?? null,
    };
  });

  return { signals: out, config: cfg };
}

export interface BriefStats {
  total: number;
  buys: number;
  fresh: number;
  approvedCount: number;
  deployed: number;
  uniqueMembers: number;
  topTicker: string | null;
}

export async function getBrief(): Promise<BriefStats> {
  try {
    const [agg] = await db
      .select({
        total: sql<number>`count(*)`,
        buys: sql<number>`sum(case when side='buy' then 1 else 0 end)`,
        members: sql<number>`count(distinct member)`,
      })
      .from(signals);
    const [ap] = await db
      .select({ c: sql<number>`count(*)`, dep: sql<number>`coalesce(sum(size_dollars),0)` })
      .from(approved)
      .where(sql`status != 'skipped'`);
    const fresh = await db
      .select({ c: sql<number>`count(*)` })
      .from(signals)
      .where(sql`days_stale <= 14 and side='buy'`);
    const top = await db
      .select({ ticker: signals.ticker, c: sql<number>`count(*)` })
      .from(signals)
      .where(sql`side='buy'`)
      .groupBy(signals.ticker)
      .orderBy(sql`count(*) desc`)
      .limit(1);
    return {
      total: Number(agg?.total ?? 0),
      buys: Number(agg?.buys ?? 0),
      fresh: Number(fresh[0]?.c ?? 0),
      approvedCount: Number(ap?.c ?? 0),
      deployed: Number(ap?.dep ?? 0),
      uniqueMembers: Number(agg?.members ?? 0),
      topTicker: top[0]?.ticker ?? null,
    };
  } catch {
    return { total: 0, buys: 0, fresh: 0, approvedCount: 0, deployed: 0, uniqueMembers: 0, topTicker: null };
  }
}
