export const fmtUsd = (n: number, max = 0) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: max })}`;

export const fmtPct = (n: number, dp = 1) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(dp)}%`;

export const fmtBracket = (lo: number | null, hi: number | null) => {
  if (lo == null && hi == null) return "amount n/a";
  if (lo != null && hi != null) return `$${lo.toLocaleString()}–${hi.toLocaleString()}`;
  return `$${(lo ?? hi)!.toLocaleString()}`;
};

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
