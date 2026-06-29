/**
 * The Convergence Conviction Score (CCS) — the distinctive core.
 *
 * Thesis: a ticker is interesting when TWO independent informed populations
 * converge on it — politicians (legislative/committee edge) AND corporate insiders
 * (operational edge) buying the same name in an overlapping window. Most trackers
 * use one or the other; the convergence is the edge.
 *
 *   base        = w_cong * cong_norm + w_ins * ins_norm
 *   convergence = 1 + k * min(cong_norm, ins_norm)   // ONLY rewards genuine overlap
 *   CCS         = base * convergence                  // super-additive, not a sum
 *
 * This module is a PURE function over plain arrays so it can be unit-tested with no
 * database. `lib/score-run.ts` is the thin DB wrapper that loads rows + persists.
 * Every sub-score is returned separately (not just the total) for the dashboard.
 */
import { hasCommitteeEdge, matchingCommittees } from "./committees";
import { ROLE_WEIGHT, type InsiderRoleValue } from "./roles";

export interface CongBuy {
  ticker: string;
  member: string;
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string; // ISO
  disclosureDate: string; // ISO
  daysStale: number;
  histReturn: number | null;
}

export interface InsBuy {
  ticker: string;
  insiderName: string;
  role: InsiderRoleValue;
  dollarValue: number;
  transactionDate: string; // ISO
  filingDate: string; // ISO
  daysStale: number;
}

export interface ScoringCfg {
  lookbackDays: number;
  wCong: number;
  wIns: number;
  kConverge: number;
  freshnessCutoffDays: number;
  minDollarVolume: number;
}

export interface CandidateSubScores {
  cong: {
    memberQuality: number;
    conviction: number;
    cluster: number;
    committeeBonus: number;
    recency: number;
    raw: number;
    norm: number;
  };
  ins: {
    roleWeight: number;
    cluster: number;
    size: number;
    recency: number;
    raw: number;
    norm: number;
  };
  base: number;
  convergenceMult: number;
}

export interface Candidate {
  ticker: string;
  rank: number;
  ccs: number;
  base: number;
  convergenceMult: number;
  congScore: number;
  insScore: number;
  congNorm: number;
  insNorm: number;
  subScores: CandidateSubScores;
  evidence: {
    congress: { member: string; qualityPct: number; amountMid: number; date: string; committees: string[] }[];
    insiders: { name: string; role: InsiderRoleValue; dollarValue: number; date: string }[];
    distinctMembers: number;
    distinctInsiders: number;
    committeesMatched: string[];
    sizesUsd: { congTotal: number; insTotal: number };
  };
  liquidityOk: boolean;
}

// ── small math helpers ────────────────────────────────────────────────────────
const daysAgo = (iso: string, today: string) => {
  const a = Date.parse(`${iso}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1e9;
  return Math.max(0, Math.round((b - a) / 86400000));
};
const expDecay = (days: number, halfLife: number) => Math.pow(0.5, days / halfLife);
const log1p = (x: number) => Math.log(1 + Math.max(0, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mid = (lo: number | null, hi: number | null) => {
  if (lo == null && hi == null) return 0;
  if (lo != null && hi != null) return (lo + hi) / 2;
  return (lo ?? hi)!;
};
/** log-scaled conviction of a dollar amount into ~[0,1] (≈$1k → 0, ≈$1M+ → 1). */
const dollarConviction = (usd: number) => clamp01((Math.log10(Math.max(usd, 1)) - 3) / 3);

/** Deterministic synthetic dollar-volume proxy (no real volume feed in the free path). */
function syntheticDollarVolume(ticker: string): number {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 2_000_000 + (h % 200) * 1_000_000; // $2M–$202M/day
}

const LIQUID_LARGE_CAPS = new Set([
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "JPM", "UNH",
  "LLY", "XOM", "V", "MA", "HD", "COST", "WMT", "PG", "JNJ", "CRWD", "PANW",
]);

function isLiquid(ticker: string, minDollarVolume: number): boolean {
  if (LIQUID_LARGE_CAPS.has(ticker)) return true;
  return syntheticDollarVolume(ticker) >= minDollarVolume;
}

// ── member quality (top-tercile gate) ─────────────────────────────────────────
interface MemberQuality {
  member: string;
  quality: number;
  percentile: number; // 0..1
  topTercile: boolean;
  trades: number;
}

/** Rank members by consistency-weighted trailing return (hit-rate × trade-count-
 *  adjusted return), not raw return. The naive per-member `histReturn` stands in
 *  for true forward returns (swap a real backtest in later). Top tercile only. */
export function rankMemberQuality(congBuys: CongBuy[]): Map<string, MemberQuality> {
  const byMember = new Map<string, { n: number; histSum: number; histN: number }>();
  for (const b of congBuys) {
    const m = byMember.get(b.member) ?? { n: 0, histSum: 0, histN: 0 };
    m.n++;
    if (b.histReturn != null) {
      m.histSum += b.histReturn;
      m.histN++;
    }
    byMember.set(b.member, m);
  }

  const raw: { member: string; quality: number; trades: number }[] = [];
  for (const [member, m] of byMember) {
    const avgHist = m.histN > 0 ? m.histSum / m.histN : 0;
    // hist hint generated in [-0.08, +0.18] → map to a [0,1] hit-rate proxy.
    const hitRateProxy = clamp01((avgHist + 0.08) / 0.26);
    const shrinkage = m.n / (m.n + 3); // trade-count adjustment (favor consistent buyers)
    const quality = hitRateProxy * shrinkage * (1 + Math.max(0, avgHist));
    raw.push({ member, quality, trades: m.n });
  }

  raw.sort((a, b) => a.quality - b.quality);
  const out = new Map<string, MemberQuality>();
  const n = raw.length;
  raw.forEach((r, i) => {
    const percentile = n > 1 ? i / (n - 1) : 1;
    out.set(r.member, {
      member: r.member,
      quality: r.quality,
      percentile,
      topTercile: percentile >= 2 / 3 - 1e-9,
      trades: r.trades,
    });
  });
  return out;
}

// ── the scorer ────────────────────────────────────────────────────────────────
export function scoreCandidates(input: {
  congBuys: CongBuy[];
  insBuys: InsBuy[];
  cfg: ScoringCfg;
  today: string; // ISO yyyy-mm-dd
}): Candidate[] {
  const { cfg, today } = input;

  // Window + freshness: keep buys disclosed within lookback AND whose TRANSACTION
  // date is within freshnessCutoffDays (combats the STOCK Act disclosure lag).
  const congBuys = input.congBuys.filter(
    (b) =>
      daysAgo(b.disclosureDate, today) <= cfg.lookbackDays &&
      daysAgo(b.transactionDate, today) <= cfg.freshnessCutoffDays,
  );
  const insBuys = input.insBuys.filter(
    (b) =>
      daysAgo(b.filingDate, today) <= cfg.lookbackDays &&
      daysAgo(b.transactionDate, today) <= cfg.freshnessCutoffDays,
  );

  // Member quality over the full window; only top-tercile members contribute.
  const quality = rankMemberQuality(congBuys);

  const tickers = new Set<string>();
  for (const b of congBuys) tickers.add(b.ticker);
  for (const b of insBuys) tickers.add(b.ticker);

  type Raw = {
    ticker: string;
    congRaw: number;
    insRaw: number;
    sub: CandidateSubScores;
    evidence: Candidate["evidence"];
  };
  const raws: Raw[] = [];

  for (const ticker of tickers) {
    // ── congressional half ──
    const tCong = congBuys.filter((b) => b.ticker === ticker && quality.get(b.member)?.topTercile);
    const congMembers = new Set(tCong.map((b) => b.member));
    let qualitySum = 0;
    let convictionSum = 0;
    let recencySum = 0;
    let committeeHits = 0;
    const committeesMatched = new Set<string>();
    const congEvidence: Candidate["evidence"]["congress"] = [];
    let congTotalUsd = 0;
    for (const b of tCong) {
      const q = quality.get(b.member)!;
      const conv = dollarConviction(mid(b.amountLow, b.amountHigh));
      const rec = expDecay(daysAgo(b.disclosureDate, today), 30);
      const edge = hasCommitteeEdge(b.member, ticker);
      qualitySum += q.percentile * rec;
      convictionSum += conv * rec;
      recencySum += rec;
      congTotalUsd += mid(b.amountLow, b.amountHigh);
      if (edge) {
        committeeHits++;
        for (const c of matchingCommittees(b.member, ticker)) committeesMatched.add(c);
      }
      congEvidence.push({
        member: b.member,
        qualityPct: Number(q.percentile.toFixed(3)),
        amountMid: Math.round(mid(b.amountLow, b.amountHigh)),
        date: b.disclosureDate,
        committees: matchingCommittees(b.member, ticker),
      });
    }
    const congCluster = log1p(congMembers.size); // sub-linear
    const congCommittee = committeeHits > 0 ? 0.25 : 0;
    // Combine: quality-weighted conviction, lifted by cluster + committee edge.
    const congRaw =
      (qualitySum + convictionSum) * (1 + 0.5 * congCluster) * (1 + congCommittee);

    // ── insider half ──
    const tIns = insBuys.filter((b) => b.ticker === ticker);
    const insPeople = new Set(tIns.map((b) => b.insiderName));
    let roleSum = 0;
    let sizeSum = 0;
    let insRecencySum = 0;
    const insEvidence: Candidate["evidence"]["insiders"] = [];
    let insTotalUsd = 0;
    for (const b of tIns) {
      const rw = ROLE_WEIGHT[b.role];
      const size = dollarConviction(b.dollarValue);
      const rec = expDecay(daysAgo(b.filingDate, today), 21);
      // bonus if the buy is large for the role (officers/dirs writing a big check).
      const sizeBonus = b.dollarValue > 250_000 ? 0.2 : 0;
      roleSum += rw * rec;
      sizeSum += size * rec * (1 + sizeBonus);
      insRecencySum += rec;
      insTotalUsd += b.dollarValue;
      insEvidence.push({
        name: b.insiderName,
        role: b.role,
        dollarValue: Math.round(b.dollarValue),
        date: b.filingDate,
      });
    }
    const insCluster = log1p(insPeople.size);
    const insRaw = (roleSum + sizeSum) * (1 + 0.5 * insCluster);

    raws.push({
      ticker,
      congRaw,
      insRaw,
      sub: {
        cong: {
          memberQuality: Number(qualitySum.toFixed(4)),
          conviction: Number(convictionSum.toFixed(4)),
          cluster: Number(congCluster.toFixed(4)),
          committeeBonus: congCommittee,
          recency: Number(recencySum.toFixed(4)),
          raw: Number(congRaw.toFixed(4)),
          norm: 0,
        },
        ins: {
          roleWeight: Number(roleSum.toFixed(4)),
          cluster: Number(insCluster.toFixed(4)),
          size: Number(sizeSum.toFixed(4)),
          recency: Number(insRecencySum.toFixed(4)),
          raw: Number(insRaw.toFixed(4)),
          norm: 0,
        },
        base: 0,
        convergenceMult: 1,
      },
      evidence: {
        congress: congEvidence,
        insiders: insEvidence,
        distinctMembers: congMembers.size,
        distinctInsiders: insPeople.size,
        committeesMatched: [...committeesMatched],
        sizesUsd: { congTotal: Math.round(congTotalUsd), insTotal: Math.round(insTotalUsd) },
      },
    });
  }

  // Normalize each half across the candidate set, then apply the convergence math.
  const maxCong = Math.max(1e-9, ...raws.map((r) => r.congRaw));
  const maxIns = Math.max(1e-9, ...raws.map((r) => r.insRaw));

  const candidates: Candidate[] = raws.map((r) => {
    const congNorm = clamp01(r.congRaw / maxCong);
    const insNorm = clamp01(r.insRaw / maxIns);
    const base = cfg.wCong * congNorm + cfg.wIns * insNorm;
    const convergenceMult = 1 + cfg.kConverge * Math.min(congNorm, insNorm);
    const ccs = base * convergenceMult;
    r.sub.cong.norm = Number(congNorm.toFixed(4));
    r.sub.ins.norm = Number(insNorm.toFixed(4));
    r.sub.base = Number(base.toFixed(4));
    r.sub.convergenceMult = Number(convergenceMult.toFixed(4));
    return {
      ticker: r.ticker,
      rank: 0,
      ccs: Number(ccs.toFixed(4)),
      base: Number(base.toFixed(4)),
      convergenceMult: Number(convergenceMult.toFixed(4)),
      congScore: Number(r.congRaw.toFixed(4)),
      insScore: Number(r.insRaw.toFixed(4)),
      congNorm: Number(congNorm.toFixed(4)),
      insNorm: Number(insNorm.toFixed(4)),
      subScores: r.sub,
      evidence: r.evidence,
      liquidityOk: isLiquid(r.ticker, cfg.minDollarVolume),
    };
  });

  // Liquidity gate (exclude failures), then rank by CCS.
  const passing = candidates.filter((c) => c.liquidityOk);
  passing.sort((a, b) => b.ccs - a.ccs);
  passing.forEach((c, i) => (c.rank = i + 1));
  return passing;
}
