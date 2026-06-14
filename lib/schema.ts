/** Drizzle schema — local SQLite. JSON via text mode; money as real; dates ISO text. */
import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

/** Normalized congressional disclosures (buys and sells). */
export const signals = sqliteTable(
  "signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    filingId: text("filing_id").notNull(), // dedupe key
    member: text("member").notNull(),
    party: text("party"),
    chamber: text("chamber"), // 'house' | 'senate'
    ticker: text("ticker").notNull(),
    side: text("side").notNull(), // 'buy' | 'sell'
    amountLow: real("amount_low"),
    amountHigh: real("amount_high"),
    transactionDate: text("transaction_date").notNull(), // ISO yyyy-mm-dd
    disclosureDate: text("disclosure_date").notNull(), // ISO yyyy-mm-dd
    daysStale: integer("days_stale").notNull(), // disclosure - transaction
    rawUrl: text("raw_url"), // link to the filing
    histReturn: real("hist_return"), // naive fwd return of this member's past buys
    source: text("source").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("signals_filing_uq").on(t.filingId),
    index("signals_ticker_idx").on(t.ticker),
    index("signals_disc_idx").on(t.disclosureDate),
  ],
);

/** Signals you've approved for execution (the only thing Claude Code may act on). */
export const approved = sqliteTable(
  "approved",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    signalId: integer("signal_id").notNull().references(() => signals.id),
    ticker: text("ticker").notNull(),
    side: text("side").notNull(),
    limitPrice: real("limit_price"),
    sizeDollars: real("size_dollars").notNull(),
    status: text("status").notNull().default("pending"), // pending | placed | skipped
    approvedAt: integer("approved_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("approved_signal_uq").on(t.signalId)],
);

/** Real fills (live mode), appended by Claude Code after each execution. */
export const trades = sqliteTable("trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id"),
  orderId: text("order_id"),
  ticker: text("ticker").notNull(),
  side: text("side").notNull(),
  qty: real("qty").notNull(),
  fillPrice: real("fill_price"),
  status: text("status").notNull(), // filled | partial | canceled | pending
  ts: integer("ts", { mode: "timestamp" }).notNull(),
});

/** Simulated fills (paper mode), from review_equity_order. Nothing real placed. */
export const paperTrades = sqliteTable("paper_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id"),
  ticker: text("ticker").notNull(),
  side: text("side").notNull(),
  qty: real("qty").notNull(),
  simPrice: real("sim_price"),
  ts: integer("ts", { mode: "timestamp" }).notNull(),
  raw: text("raw", { mode: "json" }),
});

/** Single-row settings (id=1): persisted overrides of strategy.config defaults. */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  config: text("config", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** Daily account marks for the scoreboard + drawdown peak tracking. */
export const accountSnapshots = sqliteTable(
  "account_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    account: text("account").notNull().default("paper"), // 'paper' | 'live'
    accountValue: real("account_value").notNull(),
    cash: real("cash").notNull(),
    positionsValue: real("positions_value").notNull(),
    realizedPnl: real("realized_pnl").notNull().default(0),
    peak: real("peak").notNull(),
  },
  (t) => [uniqueIndex("acct_date_uq").on(t.date, t.account)],
);

/** SPY buy-and-hold benchmark, same starting cash, same dates. */
export const benchmarkSnapshots = sqliteTable(
  "benchmark_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    account: text("account").notNull().default("paper"),
    spyClose: real("spy_close").notNull(),
    spyEquity: real("spy_equity").notNull(),
  },
  (t) => [uniqueIndex("bench_date_uq").on(t.date, t.account)],
);

/** Metadata: last sync time, etc. */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
