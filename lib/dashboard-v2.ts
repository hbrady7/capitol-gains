/**
 * Read-only data layer for the v2 monitor dashboard. Everything is defensive:
 * an empty DB or a down feed degrades to honest empty states, never a broken page.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { decisions, fills, scoredCandidates } from "./schema";
import { getRunConfig } from "./config";
import {
  getOpenPositions,
  getAvailableCash,
  getNav,
  getDeployedCost,
  getRealizedPnl,
  PAPER_STARTING_CAPITAL,
} from "./book";
import { getLastCloses } from "./quotes";
import type { CandidateSubScores } from "./scoring";

export type DecisionRow = typeof decisions.$inferSelect;

export async function getLatestDecision(): Promise<DecisionRow | null> {
  try {
    const [row] = await db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

/** Latest ENTRY (buy/hold) decision — the hero card on Today. */
export async function getLatestEntryDecision(): Promise<DecisionRow | null> {
  try {
    const [row] = await db
      .select()
      .from(decisions)
      .where(eq(decisions.kind, "entry"))
      .orderBy(desc(decisions.createdAt))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function getRecentDecisions(limit = 30): Promise<DecisionRow[]> {
  try {
    return await db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(limit);
  } catch {
    return [];
  }
}

/** Recent EXIT decisions (sell/hold-reviews) for the exit-desk strip + journal. */
export async function getRecentExitDecisions(limit = 12): Promise<DecisionRow[]> {
  try {
    return await db
      .select()
      .from(decisions)
      .where(eq(decisions.kind, "exit"))
      .orderBy(desc(decisions.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export interface CandidateView {
  ticker: string;
  rank: number;
  ccs: number;
  base: number;
  convergenceMult: number;
  congNorm: number;
  insNorm: number;
  liquidityOk: boolean;
  sub: CandidateSubScores;
  evidence: {
    congress?: { member: string; qualityPct: number; amountMid: number; date: string; committees: string[] }[];
    insiders?: { name: string; role: string; dollarValue: number; date: string }[];
    distinctMembers?: number;
    distinctInsiders?: number;
    committeesMatched?: string[];
    sizesUsd?: { congTotal: number; insTotal: number };
  };
}

export async function getLatestCandidatesView(limit = 12): Promise<{ runId: string | null; rows: CandidateView[] }> {
  try {
    const [latest] = await db
      .select({ runId: scoredCandidates.runId })
      .from(scoredCandidates)
      .orderBy(desc(scoredCandidates.createdAt))
      .limit(1);
    const runId = latest?.runId ?? null;
    if (!runId) return { runId: null, rows: [] };
    const rows = await db
      .select()
      .from(scoredCandidates)
      .where(eq(scoredCandidates.runId, runId))
      .orderBy(scoredCandidates.rank)
      .limit(limit);
    return {
      runId,
      rows: rows.map((r) => ({
        ticker: r.ticker,
        rank: r.rank,
        ccs: r.ccs,
        base: r.base,
        convergenceMult: r.convergenceMult,
        congNorm: r.congNorm,
        insNorm: r.insNorm,
        liquidityOk: r.liquidityOk,
        sub: r.subScores as CandidateSubScores,
        evidence: (r.evidence as CandidateView["evidence"]) ?? {},
      })),
    };
  } catch {
    return { runId: null, rows: [] };
  }
}

export interface PositionView {
  ticker: string;
  qty: number;
  avgPrice: number;
  lastPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPct: number;
}

export interface PositionViewX extends PositionView {
  peakPrice: number | null;
  drawdownFromPeakPct: number;
}

export interface PortfolioView {
  paperMode: boolean;
  positions: PositionViewX[];
  cash: number;
  nav: number;
  deployed: number;
  realizedPnl: number;
  startingCapital: number;
  totalReturnPct: number;
  connected: boolean;
}

export async function getPortfolioView(): Promise<PortfolioView> {
  const cfg = await getRunConfig();
  const pos = await getOpenPositions(cfg);
  const cash = await getAvailableCash(cfg);
  const deployed = await getDeployedCost(cfg);
  const nav = await getNav(cfg);
  const realizedPnl = await getRealizedPnl(cfg);
  const quotes = pos.length ? await getLastCloses(pos.map((p) => p.ticker)) : {};
  const positions: PositionViewX[] = pos.map((p) => {
    const last = quotes[p.ticker]?.price ?? p.avgPrice;
    const peak = p.peakPrice ?? p.avgPrice;
    return {
      ticker: p.ticker,
      qty: Number(p.qty.toFixed(4)),
      avgPrice: Number(p.avgPrice.toFixed(2)),
      lastPrice: Number(last.toFixed(2)),
      marketValue: Number((p.qty * last).toFixed(2)),
      costBasis: Number((p.qty * p.avgPrice).toFixed(2)),
      unrealizedPct: p.avgPrice > 0 ? last / p.avgPrice - 1 : 0,
      peakPrice: p.peakPrice != null ? Number(p.peakPrice.toFixed(2)) : null,
      drawdownFromPeakPct: peak > 0 ? (peak - last) / peak : 0,
    };
  });
  return {
    paperMode: cfg.paperMode,
    positions: positions.sort((a, b) => b.marketValue - a.marketValue),
    cash: Number(cash.toFixed(2)),
    nav: Number(nav.toFixed(2)),
    deployed: Number(deployed.toFixed(2)),
    realizedPnl: Number(realizedPnl.toFixed(2)),
    startingCapital: PAPER_STARTING_CAPITAL,
    totalReturnPct: PAPER_STARTING_CAPITAL > 0 ? nav / PAPER_STARTING_CAPITAL - 1 : 0,
    connected: pos.length > 0,
  };
}

export interface FillRow {
  ticker: string;
  side: string;
  qty: number;
  price: number;
  dollars: number;
  status: string;
  ts: Date;
}

export async function getRecentFills(limit = 50): Promise<FillRow[]> {
  try {
    const rows = await db.select().from(fills).orderBy(desc(fills.ts)).limit(limit);
    return rows.map((r) => ({
      ticker: r.ticker,
      side: r.side,
      qty: r.qty,
      price: r.price,
      dollars: r.dollars,
      status: r.status,
      ts: r.ts,
    }));
  } catch {
    return [];
  }
}
