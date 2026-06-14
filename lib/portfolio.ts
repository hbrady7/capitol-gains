/**
 * Portfolio + account state for the monitoring panels. Built ENTIRELY from rows
 * Claude Code writes after fills (`trades`, `paper_trades`, `account_snapshots`).
 * The web app never calls the brokerage — it only reads what the executor logged.
 * Everything degrades gracefully before anything is connected/filled.
 */
import { desc, sql } from "drizzle-orm";
import { db } from "./db";
import { accountSnapshots, paperTrades, trades } from "./schema";
import { getConfig } from "./settings";
import { getLastCloses } from "./quotes";

export interface PositionRow {
  ticker: string;
  qty: number;
  costBasis: number; // avg entry
  lastPrice: number;
  marketValue: number;
  unrealizedPct: number;
  allocationPct: number;
}

export interface PortfolioView {
  connected: boolean; // any fills recorded yet?
  paperMode: boolean;
  positions: PositionRow[];
  cash: number | null;
  accountValue: number | null;
  todayPnl: number | null;
  totalDeployed: number;
}

export async function getPortfolio(): Promise<PortfolioView> {
  const cfg = await getConfig();
  const table = cfg.paperMode ? paperTrades : trades;
  let fills: { ticker: string; side: string; qty: number; price: number | null }[] = [];
  try {
    const rows = await db.select().from(table);
    fills = rows.map((r) => ({
      ticker: r.ticker,
      side: r.side,
      qty: r.qty,
      price: cfg.paperMode ? (r as typeof paperTrades.$inferSelect).simPrice : (r as typeof trades.$inferSelect).fillPrice,
    }));
  } catch {
    fills = [];
  }

  if (fills.length === 0) {
    return {
      connected: false,
      paperMode: cfg.paperMode,
      positions: [],
      cash: null,
      accountValue: null,
      todayPnl: null,
      totalDeployed: 0,
    };
  }

  // Aggregate into positions.
  const agg = new Map<string, { qty: number; cost: number }>();
  for (const f of fills) {
    const cur = agg.get(f.ticker) ?? { qty: 0, cost: 0 };
    const signedQty = f.side === "buy" ? f.qty : -f.qty;
    if (f.side === "buy") cur.cost += f.qty * (f.price ?? 0);
    cur.qty += signedQty;
    agg.set(f.ticker, cur);
  }

  const tickers = [...agg.keys()];
  const quotes = await getLastCloses(tickers);
  const positions: PositionRow[] = [];
  let deployed = 0;
  for (const [ticker, v] of agg) {
    if (v.qty <= 1e-6) continue;
    const lastPrice = quotes[ticker]?.price ?? 0;
    const avg = v.qty > 0 ? v.cost / Math.max(v.qty, 1e-6) : 0;
    const marketValue = v.qty * lastPrice;
    deployed += marketValue;
    positions.push({
      ticker,
      qty: Number(v.qty.toFixed(4)),
      costBasis: Number(avg.toFixed(2)),
      lastPrice,
      marketValue: Number(marketValue.toFixed(2)),
      unrealizedPct: avg > 0 ? lastPrice / avg - 1 : 0,
      allocationPct: 0, // filled below
    });
  }
  const totalMv = positions.reduce((s, p) => s + p.marketValue, 0);
  for (const p of positions) p.allocationPct = totalMv > 0 ? p.marketValue / totalMv : 0;

  let cash: number | null = null;
  let accountValue: number | null = null;
  let todayPnl: number | null = null;
  try {
    const snaps = await db.select().from(accountSnapshots).orderBy(desc(accountSnapshots.date)).limit(2);
    if (snaps.length > 0) {
      cash = snaps[0].cash;
      accountValue = snaps[0].accountValue;
      if (snaps.length > 1) todayPnl = snaps[0].accountValue - snaps[1].accountValue;
    }
  } catch {
    /* no snapshots */
  }

  return {
    connected: true,
    paperMode: cfg.paperMode,
    positions: positions.sort((a, b) => b.marketValue - a.marketValue),
    cash,
    accountValue,
    todayPnl,
    totalDeployed: Number(deployed.toFixed(2)),
  };
}

/** Recorded drawdown peak (for surfacing the breaker status in the UI). */
export async function getDrawdownState(): Promise<{ peak: number | null; value: number | null; pct: number | null }> {
  try {
    const [snap] = await db.select().from(accountSnapshots).orderBy(desc(accountSnapshots.date)).limit(1);
    if (!snap) return { peak: null, value: null, pct: null };
    const pct = snap.peak > 0 ? (snap.peak - snap.accountValue) / snap.peak : 0;
    return { peak: snap.peak, value: snap.accountValue, pct };
  } catch {
    return { peak: null, value: null, pct: null };
  }
}

export const _keepSql = sql;
