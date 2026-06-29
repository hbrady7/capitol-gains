/**
 * Corporate-insider ingestion — SEC EDGAR Form 4 (free).
 *
 * We pull EDGAR's daily form index, fetch each Form 4 submission, and keep ONLY
 * open-market purchases (transaction code `P`, acquired). Option exercises/grants
 * /awards (codes `A`/`M`) and all sales are dropped — the operational signal we
 * care about is an insider putting their own cash in on the open market.
 *
 * EDGAR fair-access rules: a descriptive User-Agent identifying you is required,
 * and ~10 req/s. We set the UA from SEC_USER_AGENT and rate-limit politely.
 *
 * Offline/dev: a deterministic seed source (overlapping the congress seed tickers,
 * so convergence is demonstrable) is used when the congress provider is `seed`, and
 * as a graceful fallback if EDGAR is unreachable. The app never breaks on a down feed.
 */
import type { InsiderRoleValue } from "./roles";

export interface RawInsider {
  filingId: string; // dedupe key
  issuer: string;
  ticker: string;
  insiderName: string;
  role: InsiderRoleValue;
  transactionCode: string; // always 'P' here
  shares: number;
  price: number | null;
  transactionDate: string; // ISO yyyy-mm-dd
  filingDate: string; // ISO yyyy-mm-dd
  dollarValue: number;
  rawUrl: string | null;
  source: string;
}

export interface InsiderSource {
  readonly name: string;
  fetch(): Promise<RawInsider[]>;
}

const SEC_BASE = "https://www.sec.gov";
const DEFAULT_UA = "capitol-gains hollisbrady2004@gmail.com";

// ── polite rate limiter (~10 req/s) ──────────────────────────────────────────
let lastReq = 0;
async function throttled(url: string, minGapMs = 120): Promise<Response> {
  const wait = lastReq + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReq = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT || DEFAULT_UA,
      "Accept-Encoding": "gzip, deflate",
      Host: "www.sec.gov",
    },
  });
}

// ── EDGAR Form 4 source ──────────────────────────────────────────────────────
export class EdgarInsiderSource implements InsiderSource {
  readonly name = "edgar";
  constructor(
    private days = 7, // how many recent calendar days of indexes to scan
    private maxFilings = 80, // politeness cap per run
  ) {}

  async fetch(): Promise<RawInsider[]> {
    const out: RawInsider[] = [];
    const dates = recentDates(this.days);
    const entries: { cik: string; file: string; filingDate: string }[] = [];

    for (const d of dates) {
      try {
        const idx = await this.fetchDailyIndex(d);
        entries.push(...idx);
      } catch {
        /* a missing day (weekend/holiday) is fine — skip it */
      }
      if (entries.length >= this.maxFilings * 2) break;
    }

    let processed = 0;
    for (const e of entries) {
      if (processed >= this.maxFilings) break;
      processed++;
      try {
        const rows = await this.fetchAndParse(e.cik, e.file, e.filingDate);
        out.push(...rows);
      } catch {
        /* skip a single bad filing, keep going */
      }
    }
    if (out.length === 0) throw new Error("EDGAR returned no Form 4 purchases (index may be empty/unreachable)");
    return out;
  }

  private async fetchDailyIndex(yyyymmdd: string) {
    const year = yyyymmdd.slice(0, 4);
    const month = Number(yyyymmdd.slice(4, 6));
    const q = Math.floor((month - 1) / 3) + 1;
    const url = `${SEC_BASE}/Archives/edgar/daily-index/${year}/QTR${q}/form.${yyyymmdd}.idx`;
    const res = await throttled(url);
    if (!res.ok) throw new Error(`index ${yyyymmdd} HTTP ${res.status}`);
    const text = await res.text();
    const rows: { cik: string; file: string; filingDate: string }[] = [];
    for (const line of text.split(/\r?\n/)) {
      const parts = line.split(/\s{2,}/);
      if (parts.length < 5 || parts[0].trim() !== "4") continue;
      const cik = parts[2].trim();
      const file = parts[4].trim(); // edgar/data/CIK/ACCESSION.txt
      const filingDate = isoOrNull(parts[3].trim()) ?? `${year}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
      if (file.endsWith(".txt")) rows.push({ cik, file, filingDate });
    }
    return rows;
  }

  private async fetchAndParse(cik: string, file: string, filingDate: string): Promise<RawInsider[]> {
    const url = `${SEC_BASE}/Archives/${file}`;
    const res = await throttled(url);
    if (!res.ok) throw new Error(`filing HTTP ${res.status}`);
    const body = await res.text();
    const xml = between(body, "<ownershipDocument>", "</ownershipDocument>");
    if (!xml) return [];
    return parseForm4(xml, { rawUrl: url, filingDate, accession: file });
  }
}

// ── Form 4 XML parsing (regex; no XML dep) ───────────────────────────────────
export function parseForm4(
  xml: string,
  ctx: { rawUrl: string | null; filingDate: string; accession: string },
): RawInsider[] {
  const issuer = tag(xml, "issuerName") ?? "Unknown";
  const ticker = (tag(xml, "issuerTradingSymbol") ?? "").trim().toUpperCase();
  if (!ticker || ticker === "NONE") return [];

  const owner = between(xml, "<reportingOwner>", "</reportingOwner>") ?? xml;
  const insiderName = tag(owner, "rptOwnerName") ?? "Unknown insider";
  const isDirector = boolTag(owner, "isDirector");
  const isOfficer = boolTag(owner, "isOfficer");
  const isTenPct = boolTag(owner, "isTenPercentOwner");
  const officerTitle = (tag(owner, "officerTitle") ?? "").toLowerCase();
  const role = classifyRole({ isDirector, isOfficer, isTenPct, officerTitle });

  const out: RawInsider[] = [];
  const blocks = allBetween(xml, "<nonDerivativeTransaction>", "</nonDerivativeTransaction>");
  let i = 0;
  for (const b of blocks) {
    const code = (valueTag(b, "transactionCode") ?? "").trim().toUpperCase();
    const ad = (valueTag(b, "transactionAcquiredDisposedCode") ?? "").trim().toUpperCase();
    if (code !== "P" || ad !== "A") continue; // open-market purchase only
    const shares = num(valueTag(b, "transactionShares"));
    const price = num(valueTag(b, "transactionPricePerShare"));
    const txDate = isoOrNull(valueTag(b, "transactionDate") ?? "");
    if (!shares || shares <= 0 || !price || price <= 0 || !txDate) continue;
    out.push({
      filingId: `edgar:${ctx.accession}:${insiderName}:${txDate}:${i++}`,
      issuer,
      ticker,
      insiderName,
      role,
      transactionCode: "P",
      shares,
      price,
      transactionDate: txDate,
      filingDate: ctx.filingDate,
      dollarValue: Number((shares * price).toFixed(2)),
      rawUrl: ctx.rawUrl,
      source: "edgar",
    });
  }
  return out;
}

export function classifyRole(o: {
  isDirector: boolean;
  isOfficer: boolean;
  isTenPct: boolean;
  officerTitle: string;
}): InsiderRoleValue {
  const t = o.officerTitle;
  if (o.isOfficer && /(chief executive|ceo|\bpresident\b)/.test(t)) return "ceo";
  if (o.isOfficer && /(chief financial|cfo)/.test(t)) return "cfo";
  if (o.isOfficer) return "officer";
  if (o.isDirector) return "director";
  if (o.isTenPct) return "ten_pct_owner";
  return "officer";
}

// ── deterministic offline seed (overlaps congress seed tickers) ──────────────
const SEED_INSIDERS: { name: string; role: InsiderRoleValue }[] = [
  { name: "Jensen Huang", role: "ceo" },
  { name: "Colette Kress", role: "cfo" },
  { name: "Tim Cook", role: "ceo" },
  { name: "Luca Maestri", role: "cfo" },
  { name: "Satya Nadella", role: "ceo" },
  { name: "Andy Jassy", role: "ceo" },
  { name: "A Board Director", role: "director" },
  { name: "A 10% Holder", role: "ten_pct_owner" },
];
// Overlaps the congress SeedSource tickers so the convergence multiplier fires.
const SEED_TICKERS = ["NVDA", "AAPL", "MSFT", "AMZN", "LLY", "CRWD", "PANW", "AVGO"];

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0xffffffff);
}

export class SeedInsiderSource implements InsiderSource {
  readonly name = "seed-insider";
  constructor(private days = 60, private seed = 11) {}
  async fetch(): Promise<RawInsider[]> {
    const rand = lcg(this.seed);
    const out: RawInsider[] = [];
    const today = new Date();
    for (let d = this.days; d >= 0; d -= 2) {
      const filing = new Date(today.getTime() - d * 86400000);
      const dow = filing.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (rand() > 0.5) continue; // not every day has a Form 4
      const filingIso = filing.toISOString().slice(0, 10);
      const ins = SEED_INSIDERS[Math.floor(rand() * SEED_INSIDERS.length)];
      const ticker = SEED_TICKERS[Math.floor(rand() * SEED_TICKERS.length)];
      const lag = 1 + Math.floor(rand() * 3); // Form 4 lag is short (2-day rule)
      const txIso = new Date(filing.getTime() - lag * 86400000).toISOString().slice(0, 10);
      const price = Number((40 + rand() * 600).toFixed(2));
      const shares = Math.round((5_000 + rand() * 50_000) / 10) * 10;
      out.push({
        filingId: `seed-insider:${ins.name}:${ticker}:${filingIso}`,
        issuer: `${ticker} Inc.`,
        ticker,
        insiderName: ins.name,
        role: ins.role,
        transactionCode: "P",
        shares,
        price,
        transactionDate: txIso,
        filingDate: filingIso,
        dollarValue: Number((shares * price).toFixed(2)),
        rawUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
        source: "seed-insider",
      });
    }
    return out;
  }
}

/** Pick the insider source: seed for offline/dev, EDGAR for the live free path. */
export function makeInsiderSource(opts: { provider: string }): InsiderSource {
  if (opts.provider === "seed") return new SeedInsiderSource();
  return new EdgarInsiderSource();
}

// ── small parse helpers ──────────────────────────────────────────────────────
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
}
function valueTag(xml: string, name: string): string | null {
  const block = between(xml, `<${name}>`, `</${name}>`);
  if (block == null) return null;
  const v = block.match(/<value>([\s\S]*?)<\/value>/);
  return v ? v[1].trim() : block.trim();
}
function boolTag(xml: string, name: string): boolean {
  const v = (tag(xml, name) ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}
function between(s: string, a: string, b: string): string | null {
  const i = s.indexOf(a);
  if (i < 0) return null;
  const j = s.indexOf(b, i + a.length);
  if (j < 0) return null;
  return s.slice(i + a.length, j);
}
function allBetween(s: string, a: string, b: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const i = s.indexOf(a, from);
    if (i < 0) break;
    const j = s.indexOf(b, i + a.length);
    if (j < 0) break;
    out.push(s.slice(i + a.length, j));
    from = j + b.length;
  }
  return out;
}
function num(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function isoOrNull(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function recentDates(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let d = 1; d <= days; d++) {
    const dt = new Date(today.getTime() - d * 86400000);
    const dow = dt.getUTCDay();
    if (dow === 0 || dow === 6) continue; // EDGAR daily index is business days
    out.push(dt.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return out;
}
