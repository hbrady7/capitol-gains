/**
 * Catalyst layer — free public corroborators/refuters for a convergence thesis.
 *
 * The convergence edge (politicians + insiders buying) is stronger when a real-world
 * catalyst lines up: a government CONTRACT award to the issuer, a spike in LOBBYING
 * spend, or an upcoming committee HEARING with jurisdiction over the sector. It's
 * WEAKER (a refuter) when, say, lobbying collapses. These are surfaced to the
 * decision brain as fenced evidence — never as instructions — and they never
 * originate a trade on their own; they only color a name already on the CCS list.
 *
 * Sources are pluggable. The free path ships a deterministic seed source (overlaps
 * the seed convergence tickers so the feature is demonstrable offline); real
 * adapters (USASpending contract awards, Senate LDA lobbying, committee calendars)
 * drop in behind `makeCatalystSource` later — see MIGRATION_NOTES.
 *
 * PROMPT-INJECTION note: headlines are DATA. Nothing here is executable text.
 */
import { desc, gte, inArray } from "drizzle-orm";
import { db } from "./db";
import { catalysts } from "./schema";

export type CatalystKind = "contract" | "lobbying" | "hearing";
export type CatalystDirection = "support" | "refute";

export interface RawCatalyst {
  catalystId: string; // dedupe key
  ticker: string;
  kind: CatalystKind;
  direction: CatalystDirection;
  weight: number; // 0..1 magnitude
  headline: string;
  date: string; // ISO yyyy-mm-dd
  rawUrl: string | null;
  source: string;
}

/** Compact shape handed to the decision brain per ticker. */
export interface CatalystEvidence {
  kind: CatalystKind;
  direction: CatalystDirection;
  weight: number;
  headline: string;
  date: string;
}

export interface CatalystSource {
  readonly name: string;
  fetch(): Promise<RawCatalyst[]>;
}

// ── deterministic seed source (offline-friendly, overlaps convergence seeds) ────
const SEED_TICKERS = ["NVDA", "AAPL", "MSFT", "AMZN", "LLY", "CRWD", "PANW", "AVGO"];

const SECTOR_HEARING: Record<string, string> = {
  NVDA: "House Armed Services hearing on AI compute procurement",
  AVGO: "Senate Commerce hearing on semiconductor supply chains",
  CRWD: "House Homeland Security hearing on federal cyber posture",
  PANW: "Senate Intelligence hearing on network defense contracts",
  LLY: "Senate HELP hearing on drug pricing",
  MSFT: "House Oversight hearing on federal cloud (JWCC)",
  AMZN: "House Judiciary hearing on marketplace competition",
  AAPL: "Senate Commerce hearing on device right-to-repair",
};

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff);
}

export class SeedCatalystSource implements CatalystSource {
  readonly name = "seed-catalyst";
  constructor(private days = 30, private seed = 23) {}
  async fetch(): Promise<RawCatalyst[]> {
    const rand = lcg(this.seed);
    const out: RawCatalyst[] = [];
    const today = new Date();
    for (const ticker of SEED_TICKERS) {
      const roll = rand();
      if (roll > 0.7) continue; // not every name has a live catalyst
      const daysAgo = Math.floor(rand() * this.days);
      const date = new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
      // Mostly supportive corroboration; occasionally a refuter to keep it honest.
      const refute = rand() > 0.85;
      if (refute) {
        out.push({
          catalystId: `seed-cat:lobbying-drop:${ticker}:${date}`,
          ticker,
          kind: "lobbying",
          direction: "refute",
          weight: Number((0.2 + rand() * 0.3).toFixed(2)),
          headline: `${ticker} quarterly lobbying spend fell sharply vs prior quarter`,
          date,
          rawUrl: "https://lda.senate.gov/",
          source: "seed-catalyst",
        });
        continue;
      }
      const which = rand();
      if (which < 0.45) {
        const dollarsM = Math.round(50 + rand() * 950);
        out.push({
          catalystId: `seed-cat:contract:${ticker}:${date}`,
          ticker,
          kind: "contract",
          direction: "support",
          weight: Number((0.4 + rand() * 0.5).toFixed(2)),
          headline: `${ticker} awarded ~$${dollarsM}M federal contract`,
          date,
          rawUrl: "https://www.usaspending.gov/",
          source: "seed-catalyst",
        });
      } else if (which < 0.75) {
        out.push({
          catalystId: `seed-cat:lobbying:${ticker}:${date}`,
          ticker,
          kind: "lobbying",
          direction: "support",
          weight: Number((0.3 + rand() * 0.4).toFixed(2)),
          headline: `${ticker} lobbying spend up materially this quarter`,
          date,
          rawUrl: "https://lda.senate.gov/",
          source: "seed-catalyst",
        });
      } else {
        out.push({
          catalystId: `seed-cat:hearing:${ticker}:${date}`,
          ticker,
          kind: "hearing",
          direction: "support",
          weight: Number((0.25 + rand() * 0.35).toFixed(2)),
          headline: SECTOR_HEARING[ticker] ?? `Committee hearing touching ${ticker}'s sector`,
          date,
          rawUrl: "https://www.congress.gov/committees",
          source: "seed-catalyst",
        });
      }
    }
    return out;
  }
}

/** Pick the catalyst source. Seed for offline/dev; a real feed later. */
export function makeCatalystSource(opts: { provider: string }): CatalystSource {
  // Only a seed source ships in the free path today; real adapters land later.
  void opts;
  return new SeedCatalystSource();
}

// ── ingest ──────────────────────────────────────────────────────────────────
export interface CatalystIngestResult {
  source: string;
  fetched: number;
  inserted: number;
  error?: string;
}

export async function runCatalysts(provider = "seed"): Promise<CatalystIngestResult> {
  const source = makeCatalystSource({ provider });
  let raw: RawCatalyst[];
  try {
    raw = await source.fetch();
  } catch (e) {
    return { source: source.name, fetched: 0, inserted: 0, error: String(e) };
  }
  let inserted = 0;
  for (const c of raw) {
    try {
      const r = await db
        .insert(catalysts)
        .values({
          catalystId: c.catalystId,
          ticker: c.ticker,
          kind: c.kind,
          direction: c.direction,
          weight: c.weight,
          headline: c.headline,
          date: c.date,
          rawUrl: c.rawUrl,
          source: c.source,
          createdAt: new Date(),
        })
        .onConflictDoNothing({ target: catalysts.catalystId })
        .returning({ id: catalysts.id });
      inserted += r.length;
    } catch {
      /* skip a bad row, keep going */
    }
  }
  return { source: source.name, fetched: raw.length, inserted };
}

// ── reader ──────────────────────────────────────────────────────────────────
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** Recent catalysts grouped by ticker (for the decision brain + dashboard). */
export async function getCatalystsForTickers(
  tickers: string[],
  lookbackDays = 45,
): Promise<Record<string, CatalystEvidence[]>> {
  const uniq = [...new Set(tickers)].filter(Boolean);
  if (uniq.length === 0) return {};
  const since = isoDaysAgo(lookbackDays);
  try {
    const rows = await db
      .select()
      .from(catalysts)
      .where(inArray(catalysts.ticker, uniq))
      .orderBy(desc(catalysts.date));
    const out: Record<string, CatalystEvidence[]> = {};
    for (const r of rows) {
      if (r.date < since) continue;
      (out[r.ticker] ??= []).push({
        kind: r.kind as CatalystKind,
        direction: r.direction as CatalystDirection,
        weight: r.weight,
        headline: r.headline,
        date: r.date,
      });
    }
    return out;
  } catch {
    return {};
  }
}

/** All recent catalysts (dashboard feed). */
export async function getRecentCatalysts(limit = 40, lookbackDays = 45) {
  const since = isoDaysAgo(lookbackDays);
  try {
    const rows = await db
      .select()
      .from(catalysts)
      .where(gte(catalysts.date, since))
      .orderBy(desc(catalysts.date))
      .limit(limit);
    return rows;
  } catch {
    return [];
  }
}
