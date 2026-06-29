/** Insider role taxonomy + weights, shared by ingestion and the CCS scorer. */
export type InsiderRoleValue = "ceo" | "cfo" | "officer" | "director" | "ten_pct_owner";

/** Operational read, strongest first: officers (esp. CEO/CFO) see the most. */
export const ROLE_WEIGHT: Record<InsiderRoleValue, number> = {
  ceo: 1.0,
  cfo: 1.0,
  officer: 0.7,
  director: 0.5,
  ten_pct_owner: 0.35,
};

export const ROLE_LABEL: Record<InsiderRoleValue, string> = {
  ceo: "CEO",
  cfo: "CFO",
  officer: "Officer",
  director: "Director",
  ten_pct_owner: "10% owner",
};
