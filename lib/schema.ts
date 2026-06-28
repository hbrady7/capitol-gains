/** Drizzle schema — Neon Postgres (pg-core). JSON as jsonb; money as double precision; dates ISO text. */
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Normalized congressional disclosures (buys and sells). */
export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    filingId: text("filing_id").notNull(), // dedupe key
    member: text("member").notNull(),
    party: text("party"),
    chamber: text("chamber"), // 'house' | 'senate'
    ticker: text("ticker").notNull(),
    side: text("side").notNull(), // 'buy' | 'sell'
    amountLow: doublePrecision("amount_low"),
    amountHigh: doublePrecision("amount_high"),
    transactionDate: text("transaction_date").notNull(), // ISO yyyy-mm-dd
    disclosureDate: text("disclosure_date").notNull(), // ISO yyyy-mm-dd
    daysStale: integer("days_stale").notNull(), // disclosure - transaction
    rawUrl: text("raw_url"), // link to the filing
    histReturn: doublePrecision("hist_return"), // naive fwd return of this member's past buys
    source: text("source").notNull(), // 'congress' | 'insider' (Phase 2 constrains this)
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("signals_filing_uq").on(t.filingId),
    index("signals_ticker_idx").on(t.ticker),
    index("signals_disc_idx").on(t.disclosureDate),
  ],
);

/** Signals you've approved for execution (the only thing Claude Code may act on). */
export const approved = pgTable(
  "approved",
  {
    id: serial("id").primaryKey(),
    signalId: integer("signal_id").notNull().references(() => signals.id),
    ticker: text("ticker").notNull(),
    side: text("side").notNull(),
    limitPrice: doublePrecision("limit_price"),
    sizeDollars: doublePrecision("size_dollars").notNull(),
    status: text("status").notNull().default("pending"), // pending | placed | skipped
    approvedAt: timestamp("approved_at", { mode: "date" }).notNull(),
  },
  (t) => [uniqueIndex("approved_signal_uq").on(t.signalId)],
);

/** Real fills (live mode), appended by the executor after each execution. */
export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id"),
  orderId: text("order_id"),
  ticker: text("ticker").notNull(),
  side: text("side").notNull(),
  qty: doublePrecision("qty").notNull(),
  fillPrice: doublePrecision("fill_price"),
  status: text("status").notNull(), // filled | partial | canceled | pending
  ts: timestamp("ts", { mode: "date" }).notNull(),
});

/** Simulated fills (paper mode), from review_equity_order. Nothing real placed. */
export const paperTrades = pgTable("paper_trades", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id"),
  ticker: text("ticker").notNull(),
  side: text("side").notNull(),
  qty: doublePrecision("qty").notNull(),
  simPrice: doublePrecision("sim_price"),
  ts: timestamp("ts", { mode: "date" }).notNull(),
  raw: jsonb("raw"),
});

/** Single-row settings (id=1): persisted overrides of strategy.config defaults. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
});

/** Daily account marks for the scoreboard + drawdown peak tracking. */
export const accountSnapshots = pgTable(
  "account_snapshots",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    account: text("account").notNull().default("paper"), // 'paper' | 'live'
    accountValue: doublePrecision("account_value").notNull(),
    cash: doublePrecision("cash").notNull(),
    positionsValue: doublePrecision("positions_value").notNull(),
    realizedPnl: doublePrecision("realized_pnl").notNull().default(0),
    peak: doublePrecision("peak").notNull(),
  },
  (t) => [uniqueIndex("acct_date_uq").on(t.date, t.account)],
);

/** SPY buy-and-hold benchmark, same starting cash, same dates. */
export const benchmarkSnapshots = pgTable(
  "benchmark_snapshots",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    account: text("account").notNull().default("paper"),
    spyClose: doublePrecision("spy_close").notNull(),
    spyEquity: doublePrecision("spy_equity").notNull(),
  },
  (t) => [uniqueIndex("bench_date_uq").on(t.date, t.account)],
);

/** Metadata: last sync time, etc. */
export const meta = pgTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
});

// Phase 2 extends this file with: insider_filings, scored_candidates, decisions,
// positions, fills, config (control panel), baselines.
