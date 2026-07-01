/**
 * Scoring run — the thin DB wrapper around the pure CCS scorer in lib/scoring.ts.
 * Loads recent congress + insider buys, scores them, and persists a ranked,
 * fully-decomposed `scored_candidates` set under one run_id.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { insiderFilings, scoredCandidates, signals } from "./schema";
import { getRunConfig } from "./config";
import { scoreCandidates, type CongBuy, type InsBuy } from "./scoring";
import { getLearnedQuality } from "./attribution";
import type { InsiderRoleValue } from "./roles";

export interface ScoreRunResult {
  runId: string;
  candidates: number;
  topTicker: string | null;
  withConvergence: number; // candidates where both halves contribute
  at: string;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function runScore(): Promise<ScoreRunResult> {
  const at = new Date().toISOString();
  const runId = at; // ISO timestamp groups the run
  const cfg = await getRunConfig();
  const today = at.slice(0, 10);
  const windowStart = isoDaysAgo(cfg.lookbackDays + cfg.freshnessCutoffDays + 5);

  // Congress buys in window.
  const congRows = await db
    .select()
    .from(signals)
    .where(and(eq(signals.kind, "congress"), eq(signals.side, "buy"), gte(signals.disclosureDate, windowStart)));

  // Insider buys in window (all are code P from ingestion).
  const insRows = await db
    .select()
    .from(insiderFilings)
    .where(gte(insiderFilings.filingDate, windowStart));

  const congBuys: CongBuy[] = congRows.map((r) => ({
    ticker: r.ticker,
    member: r.member,
    amountLow: r.amountLow,
    amountHigh: r.amountHigh,
    transactionDate: r.transactionDate,
    disclosureDate: r.disclosureDate,
    daysStale: r.daysStale,
    histReturn: r.histReturn,
  }));
  const insBuys: InsBuy[] = insRows.map((r) => ({
    ticker: r.ticker,
    insiderName: r.insiderName,
    role: r.role as InsiderRoleValue,
    dollarValue: r.dollarValue,
    transactionDate: r.transactionDate,
    filingDate: r.filingDate,
    daysStale: r.daysStale,
  }));

  const learned = await getLearnedQuality(); // post-trade attribution tilt (neutral if none)
  const candidates = scoreCandidates({
    congBuys,
    insBuys,
    cfg: {
      lookbackDays: cfg.lookbackDays,
      wCong: cfg.wCong,
      wIns: cfg.wIns,
      kConverge: cfg.kConverge,
      freshnessCutoffDays: cfg.freshnessCutoffDays,
      minDollarVolume: cfg.minDollarVolume,
    },
    today,
    learned,
  });

  // Persist.
  const now = new Date();
  for (const c of candidates) {
    await db.insert(scoredCandidates).values({
      runId,
      ticker: c.ticker,
      rank: c.rank,
      ccs: c.ccs,
      base: c.base,
      convergenceMult: c.convergenceMult,
      congScore: c.congScore,
      insScore: c.insScore,
      congNorm: c.congNorm,
      insNorm: c.insNorm,
      subScores: c.subScores,
      evidence: c.evidence,
      liquidityOk: c.liquidityOk,
      createdAt: now,
    });
  }

  const withConvergence = candidates.filter((c) => c.congNorm > 0 && c.insNorm > 0).length;
  return {
    runId,
    candidates: candidates.length,
    topTicker: candidates[0]?.ticker ?? null,
    withConvergence,
    at,
  };
}

/** Load the most recent scoring run's candidates (for the brain + dashboard). */
export async function getLatestCandidates(limit = 25) {
  const latest = await db
    .select({ runId: scoredCandidates.runId })
    .from(scoredCandidates)
    .orderBy(desc(scoredCandidates.createdAt))
    .limit(1);
  const runId = latest[0]?.runId;
  if (!runId) return { runId: null as string | null, rows: [] as (typeof scoredCandidates.$inferSelect)[] };
  const rows = await db
    .select()
    .from(scoredCandidates)
    .where(eq(scoredCandidates.runId, runId))
    .orderBy(sql`${scoredCandidates.rank} asc`)
    .limit(limit);
  return { runId, rows };
}
