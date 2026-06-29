/**
 * Execution adapters. `ExecutionAdapter.placeBuy(ticker, dollars)` is the only
 * door to the broker; the adapter is chosen by `config.paper_mode`.
 *
 *   PaperAdapter (default)      — simulate a fill at the latest price; write to
 *                                 `fills` + upsert `positions`. Nothing real.
 *   RobinhoodAgenticAdapter     — live, via Robinhood's agentic MCP trading
 *                                 endpoint through the Anthropic MCP connector.
 *                                 GATED: refuses unless headless server-to-server
 *                                 support is explicitly confirmed (see notes).
 *   AlpacaAdapter               — live/paper fallback broker (Alpaca REST).
 *
 * The web app NEVER calls these — only the cron brain does, after the compliance
 * desk has trimmed/approved the size.
 */
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { fills, positions } from "./schema";
import { accountFor, type RunConfig } from "./config";
import { getLastClose } from "./quotes";

export interface Fill {
  ticker: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  dollars: number;
  orderId: string | null;
  status: "filled" | "partial" | "simulated";
}

export interface ExecutionAdapter {
  readonly name: string;
  placeBuy(ticker: string, dollars: number, decisionId: number | null): Promise<Fill>;
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function recordFill(account: string, decisionId: number | null, f: Fill): Promise<void> {
  await db.insert(fills).values({
    decisionId: decisionId ?? null,
    account,
    ticker: f.ticker,
    side: f.side,
    qty: f.qty,
    price: f.price,
    dollars: f.dollars,
    orderId: f.orderId,
    status: f.status,
    ts: new Date(),
  });
  // Upsert the position (average up on adds).
  const [existing] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.account, account), eq(positions.ticker, f.ticker)))
    .limit(1);
  const signed = f.side === "buy" ? f.qty : -f.qty;
  if (!existing) {
    await db.insert(positions).values({
      account,
      ticker: f.ticker,
      qty: signed,
      avgPrice: f.price,
      openedAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    const newQty = existing.qty + signed;
    const newAvg =
      f.side === "buy" && newQty > 0
        ? (existing.qty * existing.avgPrice + f.qty * f.price) / newQty
        : existing.avgPrice;
    await db
      .update(positions)
      .set({ qty: newQty, avgPrice: newAvg, updatedAt: new Date() })
      .where(eq(positions.id, existing.id));
  }
}

// ── PaperAdapter (default) ────────────────────────────────────────────────────
export class PaperAdapter implements ExecutionAdapter {
  readonly name = "paper";
  constructor(private account = "paper") {}
  async placeBuy(ticker: string, dollars: number, decisionId: number | null): Promise<Fill> {
    const { price } = await getLastClose(ticker);
    const qty = price > 0 ? Number((dollars / price).toFixed(4)) : 0;
    const fill: Fill = {
      ticker,
      side: "buy",
      qty,
      price,
      dollars: Number((qty * price).toFixed(2)),
      orderId: `paper-${decisionId ?? "x"}-${ticker}`,
      status: "simulated",
    };
    await recordFill(this.account, decisionId, fill);
    return fill;
  }
}

// ── RobinhoodAgenticAdapter (live, gated) ─────────────────────────────────────
export class RobinhoodAgenticAdapter implements ExecutionAdapter {
  readonly name = "robinhood-agentic";
  async placeBuy(): Promise<Fill> {
    // Robinhood's agentic MCP trading endpoint (https://agent.robinhood.com/mcp/trading)
    // is designed for the consumer Claude-app pairing. A headless, server-to-server
    // connection from a cron job is NOT confirmed to be supported. Until that is
    // verified, refuse rather than guess — staying in paper is the safe failure.
    if (process.env.ROBINHOOD_AGENTIC_HEADLESS_CONFIRMED !== "true") {
      throw new Error(
        "RobinhoodAgenticAdapter is not enabled: headless server-to-server support is " +
          "unconfirmed. Verify it, then set ROBINHOOD_AGENTIC_HEADLESS_CONFIRMED=true. " +
          "Until then, keep paper_mode = true.",
      );
    }
    throw new Error("RobinhoodAgenticAdapter: wire up the Anthropic MCP connector before going live.");
  }
}

// ── AlpacaAdapter (fallback live/paper broker) ────────────────────────────────
export class AlpacaAdapter implements ExecutionAdapter {
  readonly name = "alpaca";
  private base: string;
  constructor(private account = "live") {
    this.base =
      process.env.ALPACA_PAPER === "false"
        ? "https://api.alpaca.markets"
        : "https://paper-api.alpaca.markets";
  }
  async placeBuy(ticker: string, dollars: number, decisionId: number | null): Promise<Fill> {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) throw new Error("AlpacaAdapter needs ALPACA_API_KEY and ALPACA_API_SECRET.");
    // Notional, limit-equivalent via a marketable limit at last close (limit-only,
    // day, no margin). Alpaca supports notional fractional market orders; we use a
    // notional order and record the reported fill.
    const { price } = await getLastClose(ticker);
    const res = await fetch(`${this.base}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: ticker,
        notional: dollars,
        side: "buy",
        type: "limit",
        limit_price: Number((price * 1.005).toFixed(2)),
        time_in_force: "day",
      }),
    });
    if (!res.ok) throw new Error(`Alpaca order failed: HTTP ${res.status} ${await res.text()}`);
    const order = (await res.json()) as { id?: string; filled_avg_price?: string; filled_qty?: string };
    const fillPrice = Number(order.filled_avg_price ?? price);
    const qty = Number(order.filled_qty ?? (fillPrice > 0 ? dollars / fillPrice : 0));
    const fill: Fill = {
      ticker,
      side: "buy",
      qty: Number(qty.toFixed(4)),
      price: fillPrice,
      dollars: Number((qty * fillPrice).toFixed(2)),
      orderId: order.id ?? null,
      status: qty > 0 ? "filled" : "partial",
    };
    await recordFill(this.account, decisionId, fill);
    return fill;
  }
}

/** Pick the adapter by config: paper by default; live uses the broker path. */
export function makeAdapter(cfg: Pick<RunConfig, "paperMode">): ExecutionAdapter {
  if (cfg.paperMode) return new PaperAdapter(accountFor(cfg));
  // Live: prefer Alpaca (confirmed headless) unless Robinhood agentic is explicitly enabled.
  if (process.env.ROBINHOOD_AGENTIC_HEADLESS_CONFIRMED === "true") return new RobinhoodAgenticAdapter();
  return new AlpacaAdapter(accountFor(cfg));
}
