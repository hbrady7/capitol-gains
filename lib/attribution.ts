/**
 * The learning loop — post-trade attribution.
 *
 * When a position is sold at a realized P&L, that outcome is attributed back to the
 * informed actors (members of Congress + corporate insiders) whose buying put the
 * name on the convergence list in the first place. Each actor accumulates a shrunk,
 * Bayesian quality score in [0,1] (neutral 0.5). The CCS scorer reads these and
 * TILTS future scores toward actors whose past buying actually preceded gains — so
 * the edge sharpens with every closed trade.
 *
 * Attribution is idempotent: a meta cursor tracks the last processed sell fill, so
 * re-running never double-counts. Reads the scored-candidate evidence nearest the
 * position's entry to learn WHO was buying.
 */
import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { actorQuality, fills, scoredCandidates } from "./schema";
import { getMeta, setMeta } from "./meta";
import { accountFor, getRunConfig } from "./config";

const CURSOR_KEY = "attribution_cursor_fill_id";

export interface AttributionResult {
  processedFills: number;
  actorsUpdated: number;
  note?: string;
}

/** Fold every not-yet-attributed sell fill into per-actor quality. */
export async function runAttribution(): Promise<AttributionResult> {
  const cfg = await getRunConfig();
  const account = accountFor(cfg);
  const cursor = Number((await getMeta([CURSOR_KEY]))[CURSOR_KEY] ?? 0);

  let sells: (typeof fills.$inferSelect)[];
  try {
    sells = await db
      .select()
      .from(fills)
      .where(and(eq(fills.account, account), eq(fills.side, "sell"), gt(fills.id, cursor)))
      .orderBy(asc(fills.id));
  } catch {
    return { processedFills: 0, actorsUpdated: 0, note: "fills unavailable" };
  }
  if (sells.length === 0) return { processedFills: 0, actorsUpdated: 0, note: "nothing new to attribute" };

  const touched = new Set<string>();
  let maxId = cursor;
  for (const s of sells) {
    maxId = Math.max(maxId, s.id);
    const realized = s.realizedPnl ?? 0;
    const costBasis = s.dollars - realized; // proceeds − pnl = cost of the lot sold
    if (!(costBasis > 0)) continue;
    const ret = realized / costBasis; // realized return on the lot
    const actors = await actorsForTicker(s.ticker, s.ts);
    for (const a of actors) {
      await bumpActor(a.actor, a.kind, ret, s.ts);
      touched.add(`${a.kind}:${a.actor}`);
    }
  }

  if (maxId > cursor) await setMeta(CURSOR_KEY, String(maxId));
  return { processedFills: sells.length, actorsUpdated: touched.size };
}

/** Actors (members + insiders) from the scored-candidate evidence nearest to entry. */
async function actorsForTicker(
  ticker: string,
  soldAt: Date,
): Promise<{ actor: string; kind: "congress" | "insider" }[]> {
  try {
    const [row] = await db
      .select({ evidence: scoredCandidates.evidence })
      .from(scoredCandidates)
      .where(and(eq(scoredCandidates.ticker, ticker), lte(scoredCandidates.createdAt, soldAt)))
      .orderBy(desc(scoredCandidates.createdAt))
      .limit(1);
    const ev = (row?.evidence ?? {}) as {
      congress?: { member: string }[];
      insiders?: { name: string }[];
    };
    const out: { actor: string; kind: "congress" | "insider" }[] = [];
    for (const c of ev.congress ?? []) if (c.member) out.push({ actor: c.member, kind: "congress" });
    for (const i of ev.insiders ?? []) if (i.name) out.push({ actor: i.name, kind: "insider" });
    return out;
  } catch {
    return [];
  }
}

/** Update one actor's running quality with a new realized-return observation. */
async function bumpActor(
  actor: string,
  kind: "congress" | "insider",
  ret: number,
  at: Date,
): Promise<void> {
  try {
    const [existing] = await db
      .select()
      .from(actorQuality)
      .where(and(eq(actorQuality.actor, actor), eq(actorQuality.kind, kind)))
      .limit(1);
    const closedTrades = (existing?.closedTrades ?? 0) + 1;
    const wins = (existing?.wins ?? 0) + (ret > 0 ? 1 : 0);
    const sumReturn = (existing?.sumReturn ?? 0) + ret;
    const quality = computeQuality(closedTrades, wins, sumReturn);
    if (existing) {
      await db
        .update(actorQuality)
        .set({ closedTrades, wins, sumReturn, quality, lastOutcomeAt: at, updatedAt: new Date() })
        .where(eq(actorQuality.id, existing.id));
    } else {
      await db.insert(actorQuality).values({
        actor,
        kind,
        closedTrades,
        wins,
        sumReturn,
        quality,
        lastOutcomeAt: at,
        updatedAt: new Date(),
      });
    }
  } catch {
    /* best-effort — never break a run over attribution */
  }
}

/** Bayesian win-rate (Beta(1.5,1.5) prior → neutral 0.5) nudged by mean return. */
export function computeQuality(closedTrades: number, wins: number, sumReturn: number): number {
  const winRate = (wins + 1.5) / (closedTrades + 3); // shrunk toward 0.5
  const avgReturn = closedTrades > 0 ? sumReturn / closedTrades : 0;
  const nudge = 0.1 * Math.tanh(avgReturn * 5); // ±0.1 for strong average returns
  return Number(Math.max(0, Math.min(1, winRate + nudge)).toFixed(4));
}

/** Load learned quality maps for the scorer. Neutral when the table is absent. */
export async function getLearnedQuality(): Promise<{
  congress: Record<string, number>;
  insider: Record<string, number>;
}> {
  const congress: Record<string, number> = {};
  const insider: Record<string, number> = {};
  try {
    const rows = await db.select().from(actorQuality);
    for (const r of rows) {
      if (r.kind === "congress") congress[r.actor] = r.quality;
      else insider[r.actor] = r.quality;
    }
  } catch {
    /* neutral */
  }
  return { congress, insider };
}

/** Top actors by learned quality (dashboard leaderboard). */
export async function getActorLeaderboard(limit = 12) {
  try {
    return await db
      .select()
      .from(actorQuality)
      .where(sql`${actorQuality.closedTrades} > 0`)
      .orderBy(desc(actorQuality.quality))
      .limit(limit);
  } catch {
    return [];
  }
}
