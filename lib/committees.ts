/**
 * Committee relevance — a config table (edit here, no code changes elsewhere).
 *
 * The thesis for the congressional half: a member on a committee with jurisdiction
 * over a company's sector has an information edge when they buy in that sector
 * (Armed Services → defense, HELP → pharma/health, Financial Services → banks,
 * Energy → energy). We apply a bonus when a buyer's committee jurisdiction matches
 * the bought company's sector.
 *
 * Real committee rosters change each Congress; this static map covers the seed
 * members and the common large-caps. Swap in a live roster feed later.
 */

export type Sector =
  | "tech"
  | "health"
  | "financials"
  | "energy"
  | "defense"
  | "consumer"
  | "other";

/** Committee → the sectors it has jurisdiction over. */
export const COMMITTEE_SECTORS: Record<string, Sector[]> = {
  "Armed Services": ["defense", "tech"],
  HELP: ["health"], // Health, Education, Labor & Pensions
  "Financial Services": ["financials"],
  Banking: ["financials"],
  "Energy and Commerce": ["energy", "health"],
  "Energy and Natural Resources": ["energy"],
  Finance: ["financials", "health"],
  "Commerce, Science, and Transportation": ["tech"],
};

/** Member → committees (seed members). Drives the relevance bonus. */
export const MEMBER_COMMITTEES: Record<string, string[]> = {
  "Tommy Tuberville": ["Armed Services", "HELP"],
  "Markwayne Mullin": ["Armed Services", "Finance"],
  "Josh Gottheimer": ["Financial Services"],
  "Ro Khanna": ["Armed Services"],
  "Dan Crenshaw": ["Energy and Commerce"],
  "Sheldon Whitehouse": ["Finance", "Energy and Natural Resources"],
  "Nancy Pelosi": [],
  "Marjorie Taylor Greene": [],
};

/** Ticker → sector (covers the common large-caps in our universe). */
export const TICKER_SECTOR: Record<string, Sector> = {
  NVDA: "tech",
  AAPL: "tech",
  MSFT: "tech",
  AMZN: "consumer",
  GOOGL: "tech",
  META: "tech",
  AVGO: "tech",
  CRWD: "tech",
  PANW: "tech",
  TSLA: "consumer",
  LLY: "health",
  UNH: "health",
  XOM: "energy",
  JPM: "financials",
};

export function sectorOf(ticker: string): Sector {
  return TICKER_SECTOR[ticker] ?? "other";
}

/** Does this member sit on a committee with jurisdiction over the ticker's sector? */
export function hasCommitteeEdge(member: string, ticker: string): boolean {
  const sector = sectorOf(ticker);
  const committees = MEMBER_COMMITTEES[member] ?? [];
  for (const c of committees) {
    if ((COMMITTEE_SECTORS[c] ?? []).includes(sector)) return true;
  }
  return false;
}

/** Which committee(s) gave the edge — for the evidence trail. */
export function matchingCommittees(member: string, ticker: string): string[] {
  const sector = sectorOf(ticker);
  return (MEMBER_COMMITTEES[member] ?? []).filter((c) =>
    (COMMITTEE_SECTORS[c] ?? []).includes(sector),
  );
}
