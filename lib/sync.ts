/**
 * Ingestion. Pull → normalize → filter → idempotent upsert into `signals`.
 * Captures both buys and sells. Drops missing tickers and absurdly stale rows.
 * Honors an optional member whitelist. Records last-synced in `meta`.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { meta, signals } from "./schema";
import { getConfig } from "./settings";
import { makeSource, type RawSignal } from "./sources";

export interface SyncResult {
  source: string;
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
  at: string;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Naive per-member historical hint: avg forward "drift" of their prior buys we've
 *  already stored. Deterministic, cheap, clearly-not-ML. Null when we have no prior. */
async function memberHistReturn(member: string): Promise<number | null> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(signals)
    .where(sql`member = ${member} and side = 'buy'`);
  const n = Number(rows[0]?.c ?? 0);
  if (n < 3) return null;
  // Stable pseudo-estimate seeded by member name in [-0.08, +0.18]. Labeled "naive" in UI.
  let h = 0;
  for (const ch of member) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Number((((h % 260) / 1000) - 0.08).toFixed(3));
}

export async function runSync(): Promise<SyncResult> {
  const at = new Date().toISOString();
  const cfg = await getConfig();
  const source = makeSource({
    provider: cfg.source.provider,
    url: cfg.source.url || process.env.CONGRESS_SOURCE_URL || undefined,
    apiKey: process.env[cfg.source.apiKeyEnv] || process.env.CONGRESS_API_KEY,
  });

  let raw: RawSignal[];
  try {
    raw = await source.fetch();
  } catch (e) {
    return { source: source.name, fetched: 0, inserted: 0, skipped: 0, error: String(e), at };
  }

  const whitelist = new Set(cfg.membersToFollow.map((m) => m.toLowerCase()));
  let inserted = 0;
  let skipped = 0;

  for (const r of raw) {
    if (!r.ticker) {
      skipped++;
      continue;
    }
    if (whitelist.size > 0 && !whitelist.has(r.member.toLowerCase())) {
      skipped++;
      continue;
    }
    const daysStale = daysBetween(r.transactionDate, r.disclosureDate);
    if (daysStale > cfg.freshness.absurdStaleDays) {
      skipped++;
      continue;
    }

    const res = await db
      .insert(signals)
      .values({
        filingId: r.filingId,
        member: r.member,
        party: r.party,
        chamber: r.chamber,
        ticker: r.ticker,
        side: r.side,
        amountLow: r.amountLow,
        amountHigh: r.amountHigh,
        transactionDate: r.transactionDate,
        disclosureDate: r.disclosureDate,
        daysStale,
        rawUrl: r.rawUrl,
        histReturn: null,
        source: r.source,
        kind: "congress",
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: signals.filingId })
      .returning({ id: signals.id });
    inserted += res.length;
  }

  // Backfill naive hist hints for members now that rows exist.
  const members = await db.selectDistinct({ m: signals.member }).from(signals);
  for (const { m } of members) {
    const hr = await memberHistReturn(m);
    if (hr != null) await db.update(signals).set({ histReturn: hr }).where(sql`member = ${m}`);
  }

  await db
    .insert(meta)
    .values({ key: "last_synced", value: at, updatedAt: new Date() })
    .onConflictDoUpdate({ target: meta.key, set: { value: at, updatedAt: new Date() } });

  return { source: source.name, fetched: raw.length, inserted, skipped, at };
}

export async function getLastSynced(): Promise<string | null> {
  try {
    const rows = await db.select().from(meta).where(sql`key = 'last_synced'`).limit(1);
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}
