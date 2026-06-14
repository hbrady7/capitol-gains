/**
 * Congress data sources behind one interface. `seed` works offline with zero
 * setup; the live adapters fetch the public stock-watcher JSON datasets (or
 * Finnhub). All return normalized RawSignal rows; the sync engine does filtering
 * and persistence. Swapping sources is a config change, not a code change.
 */
import type { SourceProvider } from "../strategy.config";

export interface RawSignal {
  filingId: string;
  member: string;
  party: string | null;
  chamber: "house" | "senate" | null;
  ticker: string;
  side: "buy" | "sell";
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string; // ISO yyyy-mm-dd
  disclosureDate: string; // ISO yyyy-mm-dd
  rawUrl: string | null;
  source: string;
}

export interface CongressSource {
  readonly name: string;
  fetch(): Promise<RawSignal[]>;
}

/** Parse "$1,001 - $15,000" style ranges into [low, high]. */
export function parseAmountRange(s?: string | null): [number | null, number | null] {
  if (!s) return [null, null];
  const nums = s.replace(/[$,]/g, "").match(/\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return [null, null];
  const lo = Number(nums[0]);
  const hi = nums[1] ? Number(nums[1]) : lo;
  return [Number.isFinite(lo) ? lo : null, Number.isFinite(hi) ? hi : null];
}

export function normalizeSide(t?: string | null): "buy" | "sell" | null {
  const s = (t ?? "").toLowerCase();
  if (s.includes("purchase") || s === "buy" || s.startsWith("p")) return "buy";
  if (s.includes("sale") || s.includes("sell") || s.startsWith("s")) return "sell";
  return null;
}

// ── Live adapter: house/senate stock watcher public JSON ──────────────────────
interface WatcherRow {
  transaction_date?: string;
  disclosure_date?: string;
  ticker?: string;
  type?: string;
  amount?: string;
  representative?: string;
  senator?: string;
  party?: string;
  ptr_link?: string;
  disclosure_year?: number;
}

const WATCHER_DEFAULTS: Record<string, string> = {
  "house-stock-watcher":
    "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json",
  "senate-stock-watcher":
    "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json",
};

class StockWatcherSource implements CongressSource {
  constructor(
    readonly name: SourceProvider,
    private chamber: "house" | "senate",
    private url: string,
  ) {}

  async fetch(): Promise<RawSignal[]> {
    const res = await fetchWithRetry(this.url);
    const rows = (await res.json()) as WatcherRow[];
    const out: RawSignal[] = [];
    for (const r of rows) {
      const side = normalizeSide(r.type);
      const ticker = (r.ticker ?? "").trim().toUpperCase();
      if (!side || !ticker || ticker === "--" || !r.transaction_date) continue;
      const [lo, hi] = parseAmountRange(r.amount);
      const member = (r.representative ?? r.senator ?? "Unknown").trim();
      const tx = isoDate(r.transaction_date);
      const disc = isoDate(r.disclosure_date ?? r.transaction_date);
      out.push({
        filingId: `${this.chamber}:${member}:${ticker}:${tx}:${side}:${r.ptr_link ?? lo ?? ""}`,
        member,
        party: r.party ?? null,
        chamber: this.chamber,
        ticker,
        side,
        amountLow: lo,
        amountHigh: hi,
        transactionDate: tx,
        disclosureDate: disc,
        rawUrl: r.ptr_link ?? null,
        source: this.name,
      });
    }
    return out;
  }
}

// ── Finnhub adapter (needs API key) ──────────────────────────────────────────
class FinnhubSource implements CongressSource {
  readonly name = "finnhub";
  constructor(private apiKey: string, private url: string) {}
  async fetch(): Promise<RawSignal[]> {
    if (!this.apiKey) throw new Error("Finnhub source selected but CONGRESS_API_KEY is empty.");
    // Finnhub's congressional-trading endpoint is symbol-scoped; without a
    // watchlist there's nothing to page. Document + require explicit tickers.
    throw new Error(
      "Finnhub adapter needs a ticker watchlist; use a stock-watcher source or `seed` for broad ingest.",
    );
  }
}

// ── Seed source: deterministic, offline, reproducible ────────────────────────
const MEMBERS = [
  { m: "Nancy Pelosi", p: "Democrat", c: "house" as const },
  { m: "Marjorie Taylor Greene", p: "Republican", c: "house" as const },
  { m: "Tommy Tuberville", p: "Republican", c: "senate" as const },
  { m: "Ro Khanna", p: "Democrat", c: "house" as const },
  { m: "Markwayne Mullin", p: "Republican", c: "senate" as const },
  { m: "Josh Gottheimer", p: "Democrat", c: "house" as const },
  { m: "Dan Crenshaw", p: "Republican", c: "house" as const },
  { m: "Sheldon Whitehouse", p: "Democrat", c: "senate" as const },
];
const TICKERS = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "AVGO", "CRWD", "PANW", "LLY", "UNH", "XOM", "TSLA", "JPM"];
const BRACKETS: [number, number][] = [
  [1001, 15000],
  [15001, 50000],
  [50001, 100000],
  [100001, 250000],
  [250001, 500000],
];

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff);
}

class SeedSource implements CongressSource {
  readonly name = "seed";
  constructor(private days = 90, private perDay = 3, private seed = 7) {}
  async fetch(): Promise<RawSignal[]> {
    const rand = lcg(this.seed);
    const out: RawSignal[] = [];
    const today = new Date();
    for (let d = this.days; d >= 0; d--) {
      const disc = new Date(today.getTime() - d * 86400000);
      const dow = disc.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const discIso = disc.toISOString().slice(0, 10);
      for (let i = 0; i < this.perDay; i++) {
        const mem = MEMBERS[Math.floor(rand() * MEMBERS.length)];
        const ticker = TICKERS[Math.floor(rand() * TICKERS.length)];
        const [lo, hi] = BRACKETS[Math.floor(rand() * BRACKETS.length)];
        const side: "buy" | "sell" = rand() > 0.3 ? "buy" : "sell";
        const lag = 20 + Math.floor(rand() * 35); // 20–55 day disclosure lag
        const tx = new Date(disc.getTime() - lag * 86400000).toISOString().slice(0, 10);
        out.push({
          filingId: `seed:${mem.m}:${ticker}:${discIso}:${side}:${i}`,
          member: mem.m,
          party: mem.p,
          chamber: mem.c,
          ticker,
          side,
          amountLow: lo,
          amountHigh: hi,
          transactionDate: tx,
          disclosureDate: discIso,
          rawUrl: "https://efdsearch.senate.gov/search/",
          source: "seed",
        });
      }
    }
    return out;
  }
}

export function makeSource(opts: {
  provider: SourceProvider;
  url?: string;
  apiKey?: string;
}): CongressSource {
  switch (opts.provider) {
    case "house-stock-watcher":
      return new StockWatcherSource("house-stock-watcher", "house", opts.url || WATCHER_DEFAULTS["house-stock-watcher"]);
    case "senate-stock-watcher":
      return new StockWatcherSource("senate-stock-watcher", "senate", opts.url || WATCHER_DEFAULTS["senate-stock-watcher"]);
    case "finnhub":
      return new FinnhubSource(opts.apiKey ?? "", opts.url ?? "");
    case "seed":
    default:
      return new SeedSource();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function isoDate(s: string): string {
  // Accept mm/dd/yyyy or yyyy-mm-dd; return yyyy-mm-dd.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return s.slice(0, 10);
}

export async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "capitol-gains/1.0" } });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error(`Source unreachable after ${attempts} attempts: ${String(lastErr)}`);
}
