/**
 * Last-close quotes for suggested limit prices. Tries a free CSV source (stooq
 * by default) and falls back to a deterministic synthetic price when the source
 * is unreachable — the app must never break because a quote feed is down.
 */
const SYNTHETIC = new Map<string, number>();

export async function getLastClose(symbol: string): Promise<{ price: number; synthetic: boolean }> {
  const tmpl = process.env.QUOTE_SOURCE_URL;
  if (tmpl) {
    try {
      const url = tmpl.replace("{SYMBOL}", symbol.toLowerCase());
      const res = await fetch(url, { headers: { "User-Agent": "capitol-gains/1.0" } });
      if (res.ok) {
        const text = await res.text();
        const price = parseStooqCsv(text);
        if (price && price > 0) return { price, synthetic: false };
      }
    } catch {
      /* fall through to synthetic */
    }
  }
  return { price: syntheticClose(symbol), synthetic: true };
}

/** Batch helper used by the dashboard; resolves all in parallel, never throws. */
export async function getLastCloses(symbols: string[]): Promise<Record<string, { price: number; synthetic: boolean }>> {
  const uniq = [...new Set(symbols)];
  const entries = await Promise.all(
    uniq.map(async (s) => [s, await getLastClose(s).catch(() => ({ price: syntheticClose(s), synthetic: true }))] as const),
  );
  return Object.fromEntries(entries);
}

function parseStooqCsv(text: string): number | null {
  // header: Symbol,Date,Time,Open,High,Low,Close,Volume
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const cols = lines[1].split(",");
  const close = Number(cols[6]);
  return Number.isFinite(close) ? close : null;
}

/** Deterministic per-symbol price (stable across calls) so the UI is consistent. */
export function syntheticClose(symbol: string): number {
  if (SYNTHETIC.has(symbol)) return SYNTHETIC.get(symbol)!;
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const price = Number((20 + (h % 480) + (h % 100) / 100).toFixed(2));
  SYNTHETIC.set(symbol, price);
  return price;
}
