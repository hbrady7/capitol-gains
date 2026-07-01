/**
 * Dual ingestion — the v2 entry point. Runs both informed populations:
 *   1. Congress (existing feed, unchanged) → `signals` (kind='congress')
 *   2. Corporate insiders (SEC EDGAR Form 4, code P) → `insider_filings` AND a
 *      normalized `signals` row (kind='insider') so both feeds share one shape.
 *
 * Each feed sits behind a source adapter (CongressSource / InsiderSource). A paid
 * `UnusualWhalesSource` (congress + insider in one) can be dropped in later by
 * config — see MIGRATION_NOTES. The free path (stock-watcher + EDGAR, with seed
 * fallbacks) ships now. Idempotent upserts; never throws to the caller.
 */
import { db } from "./db";
import { insiderFilings, meta, signals } from "./schema";
import { getConfig } from "./settings";
import { makeInsiderSource, type RawInsider } from "./insider";
import { runSync, type SyncResult } from "./sync";
import { runCatalysts, type CatalystIngestResult } from "./catalysts";

export interface IngestResult {
  congress: SyncResult;
  insider: { source: string; fetched: number; inserted: number; skipped: number; error?: string };
  catalysts: CatalystIngestResult;
  at: string;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export async function runIngest(): Promise<IngestResult> {
  const at = new Date().toISOString();
  const cfg = await getConfig();

  // 1. Congress (unchanged feed; writes kind='congress').
  const congress = await runSync();

  // 2. Insider (EDGAR Form 4, or seed offline / on failure).
  const insider = await ingestInsider(cfg.freshness.absurdStaleDays, cfg.source.provider);

  // 3. Catalysts (free convergence corroborators/refuters — seed path today).
  const catalysts = await runCatalysts(cfg.source.provider === "seed" ? "seed" : "seed");

  await db
    .insert(meta)
    .values({ key: "last_ingested", value: at, updatedAt: new Date() })
    .onConflictDoUpdate({ target: meta.key, set: { value: at, updatedAt: new Date() } });

  return { congress, insider, catalysts, at };
}

async function ingestInsider(absurdStaleDays: number, congressProvider: string) {
  const source = makeInsiderSource({ provider: congressProvider });
  let raw: RawInsider[];
  try {
    raw = await source.fetch();
  } catch (e) {
    // Graceful fallback to the offline seed so the pipeline still produces data.
    try {
      const { SeedInsiderSource } = await import("./insider");
      raw = await new SeedInsiderSource().fetch();
      return { ...(await persistInsider(raw, absurdStaleDays)), source: `seed-insider (fallback: ${String(e)})` };
    } catch (e2) {
      return { source: source.name, fetched: 0, inserted: 0, skipped: 0, error: String(e2) };
    }
  }
  return { ...(await persistInsider(raw, absurdStaleDays)), source: source.name };
}

async function persistInsider(raw: RawInsider[], absurdStaleDays: number) {
  let inserted = 0;
  let skipped = 0;
  for (const r of raw) {
    const daysStale = daysBetween(r.transactionDate, r.filingDate);
    if (!r.ticker || daysStale > absurdStaleDays) {
      skipped++;
      continue;
    }
    // Detailed insider row — open-market PURCHASES only (the CCS buy signal). Sales
    // are captured only as a normalized `signals` sell row for the exit desk.
    if (r.side === "buy") {
      const a = await db
        .insert(insiderFilings)
        .values({
          filingId: r.filingId,
          issuer: r.issuer,
          ticker: r.ticker,
          insiderName: r.insiderName,
          role: r.role,
          transactionCode: r.transactionCode,
          shares: r.shares,
          price: r.price,
          transactionDate: r.transactionDate,
          filingDate: r.filingDate,
          dollarValue: r.dollarValue,
          daysStale,
          rawUrl: r.rawUrl,
          source: r.source,
          createdAt: new Date(),
        })
        .onConflictDoNothing({ target: insiderFilings.filingId })
        .returning({ id: insiderFilings.id });
      inserted += a.length;
    }

    // Normalized signal row (kind='insider'; side buy|sell) so both feeds share one
    // shape. Sells feed thesis-invalidation in the exit desk; scoring ignores them.
    await db
      .insert(signals)
      .values({
        filingId: r.filingId,
        member: r.insiderName,
        party: null,
        chamber: null,
        ticker: r.ticker,
        side: r.side,
        amountLow: r.dollarValue,
        amountHigh: r.dollarValue,
        transactionDate: r.transactionDate,
        disclosureDate: r.filingDate,
        daysStale,
        rawUrl: r.rawUrl,
        histReturn: null,
        source: r.source,
        kind: "insider",
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: signals.filingId });
  }
  return { fetched: raw.length, inserted, skipped };
}
