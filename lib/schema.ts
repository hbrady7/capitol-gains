/** Drizzle schema — Neon Postgres (pg-core). JSON as jsonb; money as double precision; dates ISO text. */
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Which informed population a signal comes from — the two halves of convergence. */
export const signalKind = pgEnum("signal_kind", ["congress", "insider"]);

/** Corporate-insider roles, ordered by operational read (CEO/CFO strongest). */
export const insiderRole = pgEnum("insider_role", [
  "ceo",
  "cfo",
  "officer",
  "director",
  "ten_pct_owner",
]);

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
    source: text("source").notNull(), // feed/provider name: 'seed' | 'house-stock-watcher' | 'edgar' | ...
    kind: signalKind("kind").notNull().default("congress"), // congress | insider — the convergence halves
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("signals_filing_uq").on(t.filingId),
    index("signals_ticker_idx").on(t.ticker),
    index("signals_disc_idx").on(t.disclosureDate),
    index("signals_kind_idx").on(t.kind),
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

// ─────────────────────────────────────────────────────────────────────────────
// v2 (Convergence) tables
// ─────────────────────────────────────────────────────────────────────────────

/** SEC EDGAR Form 4 open-market insider purchases (transaction code `P` only). */
export const insiderFilings = pgTable(
  "insider_filings",
  {
    id: serial("id").primaryKey(),
    filingId: text("filing_id").notNull(), // accession+row dedupe key
    issuer: text("issuer").notNull(),
    ticker: text("ticker").notNull(),
    insiderName: text("insider_name").notNull(),
    role: insiderRole("role").notNull(),
    transactionCode: text("transaction_code").notNull().default("P"), // only 'P' kept
    shares: doublePrecision("shares").notNull(),
    price: doublePrecision("price"),
    transactionDate: text("transaction_date").notNull(), // ISO yyyy-mm-dd
    filingDate: text("filing_date").notNull(), // ISO yyyy-mm-dd
    dollarValue: doublePrecision("dollar_value").notNull(),
    daysStale: integer("days_stale").notNull(), // filing - transaction
    rawUrl: text("raw_url"),
    source: text("source").notNull().default("edgar"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("insider_filing_uq").on(t.filingId),
    index("insider_ticker_idx").on(t.ticker),
    index("insider_filing_date_idx").on(t.filingDate),
  ],
);

/** One ranked convergence candidate per scoring run, with EVERY sub-score stored
 *  separately (not just the total) plus the supporting evidence as JSON. */
export const scoredCandidates = pgTable(
  "scored_candidates",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id").notNull(), // groups a single `npm run score` pass
    ticker: text("ticker").notNull(),
    rank: integer("rank").notNull(),

    // Decomposed Convergence Conviction Score (CCS) — stored, not just the total.
    ccs: doublePrecision("ccs").notNull(),
    base: doublePrecision("base").notNull(), // w_cong*cong + w_ins*ins
    convergenceMult: doublePrecision("convergence_mult").notNull(), // 1 + k*min(cong_norm, ins_norm)
    congScore: doublePrecision("cong_score").notNull(),
    insScore: doublePrecision("ins_score").notNull(),
    congNorm: doublePrecision("cong_norm").notNull(),
    insNorm: doublePrecision("ins_norm").notNull(),

    // Per-component breakdown for both halves (memberQuality, conviction, cluster,
    // committee, recency / role, cluster, size, recency) — drives the UI leaderboard.
    subScores: jsonb("sub_scores").notNull(),
    // Which members, which insiders, sizes, dates, committees.
    evidence: jsonb("evidence").notNull(),

    liquidityOk: boolean("liquidity_ok").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("scored_run_ticker_uq").on(t.runId, t.ticker),
    index("scored_run_idx").on(t.runId),
  ],
);

/** The LLM portfolio manager's decision per run + the full reasoning trace.
 *  `kind` splits the two brains: 'entry' (buy proposals) and 'exit' (sell proposals).
 *  Both share this table so the journal is one unified reasoning stream. */
export const decisions = pgTable(
  "decisions",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id").notNull(),
    kind: text("kind").notNull().default("entry"), // 'entry' (buy) | 'exit' (sell)
    selectedTicker: text("selected_ticker"), // null on a hold
    action: text("action").notNull(), // 'buy' | 'sell' | 'hold'
    dollarSize: doublePrecision("dollar_size").notNull().default(0),
    sellQty: doublePrecision("sell_qty"), // shares to sell (exit decisions only)
    sellFraction: doublePrecision("sell_fraction"), // 0–1 of the position (exit only)
    confidence: doublePrecision("confidence"), // 0–1
    exitTriggers: jsonb("exit_triggers"), // deterministic triggers that prompted the exit review
    thesis: text("thesis"),
    risks: text("risks"),
    reasoning: text("reasoning"), // the full chain of thought, verbatim
    model: text("model"), // which model produced it
    mode: text("mode").notNull().default("paper"), // paper | live
    guardrailOutcome: text("guardrail_outcome"), // placed | trimmed | blocked
    guardrailReason: text("guardrail_reason"),
    finalDollarSize: doublePrecision("final_dollar_size"), // after compliance trim
    realizedPnl: doublePrecision("realized_pnl"), // realized P&L on a closed/sold lot
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (t) => [
    index("decisions_run_idx").on(t.runId),
    index("decisions_created_idx").on(t.createdAt),
    index("decisions_kind_idx").on(t.kind),
  ],
);

/** Open positions (paper or live), maintained by the execution adapter.
 *  `peakPrice` is the trailing high-water mark since entry — the marks step
 *  advances it each run so the exit desk can enforce a trailing stop. */
export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    account: text("account").notNull().default("paper"), // paper | live
    ticker: text("ticker").notNull(),
    qty: doublePrecision("qty").notNull(),
    avgPrice: doublePrecision("avg_price").notNull(),
    peakPrice: doublePrecision("peak_price"), // trailing high-water since entry
    thesis: text("thesis"), // entry thesis, carried for exit review
    openedAt: timestamp("opened_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (t) => [uniqueIndex("positions_acct_ticker_uq").on(t.account, t.ticker)],
);

/** Every fill the executor records (paper sim or live), tied to a decision.
 *  `realizedPnl` is set on sells: proceeds − (qtySold × avgCost) at sale time. */
export const fills = pgTable(
  "fills",
  {
    id: serial("id").primaryKey(),
    decisionId: integer("decision_id").references(() => decisions.id),
    account: text("account").notNull().default("paper"),
    ticker: text("ticker").notNull(),
    side: text("side").notNull(), // buy | sell
    qty: doublePrecision("qty").notNull(),
    price: doublePrecision("price").notNull(),
    dollars: doublePrecision("dollars").notNull(),
    realizedPnl: doublePrecision("realized_pnl"), // sells only
    orderId: text("order_id"),
    status: text("status").notNull().default("filled"), // filled | partial | canceled | simulated
    ts: timestamp("ts", { mode: "date" }).notNull(),
  },
  (t) => [index("fills_ticker_idx").on(t.ticker), index("fills_ts_idx").on(t.ts)],
);

/** Single-row control panel (id=1). Toggled from the dashboard — no redeploy to
 *  flip the kill switch or paper/live. These bound the autonomous brain. */
export const config = pgTable("config", {
  id: integer("id").primaryKey(), // always 1
  killSwitch: boolean("kill_switch").notNull().default(false),
  paperMode: boolean("paper_mode").notNull().default(true), // <-- safe default
  maxPerPosition: doublePrecision("max_per_position").notNull().default(100),
  maxPerDay: doublePrecision("max_per_day").notNull().default(200),
  maxOpenPositions: integer("max_open_positions").notNull().default(10),
  drawdownHaltPct: doublePrecision("drawdown_halt_pct").notNull().default(15),
  freshnessCutoffDays: integer("freshness_cutoff_days").notNull().default(21),
  cooldownDays: integer("cooldown_days").notNull().default(30),
  cronCadence: text("cron_cadence").notNull().default("daily"),
  // Exit desk (Phase v3) — protective stops are deterministic; thesis exits are LLM-reasoned.
  exitsEnabled: boolean("exits_enabled").notNull().default(true),
  trailingStopPct: doublePrecision("trailing_stop_pct").notNull().default(20), // sell if down this % from peak
  hardStopPct: doublePrecision("hard_stop_pct").notNull().default(25), // sell if down this % from cost
  takeProfitPct: doublePrecision("take_profit_pct").notNull().default(0), // 0 = disabled
  maxHoldDays: integer("max_hold_days").notNull().default(90), // time-decay exit
  confidenceSizing: boolean("confidence_sizing").notNull().default(true), // scale buys by conviction
  // CCS tunables (Phase 4).
  lookbackDays: integer("lookback_days").notNull().default(45),
  wCong: doublePrecision("w_cong").notNull().default(1),
  wIns: doublePrecision("w_ins").notNull().default(1),
  kConverge: doublePrecision("k_converge").notNull().default(1.5),
  minDollarVolume: doublePrecision("min_dollar_volume").notNull().default(5_000_000),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
});

/** Daily NAV for the three-way experiment: LLM portfolio vs SPY vs naive basket. */
export const baselines = pgTable(
  "baselines",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    account: text("account").notNull().default("paper"),
    llmNav: doublePrecision("llm_nav").notNull(),
    spyNav: doublePrecision("spy_nav").notNull(),
    naiveNav: doublePrecision("naive_nav").notNull(),
  },
  (t) => [uniqueIndex("baselines_date_acct_uq").on(t.date, t.account)],
);

// ─────────────────────────────────────────────────────────────────────────────
// v3 (Learning loop + exits + briefing + catalysts)
// ─────────────────────────────────────────────────────────────────────────────

/** Post-trade attribution: a learned quality score per informed actor (a member of
 *  Congress or a corporate insider) built from the realized outcomes of the closed
 *  positions their buying contributed to. This sharpens the CCS over time — the
 *  scorer blends this learned prior with the naive trailing-return proxy. */
export const actorQuality = pgTable(
  "actor_quality",
  {
    id: serial("id").primaryKey(),
    actor: text("actor").notNull(), // member or insider name
    kind: signalKind("kind").notNull(), // congress | insider
    closedTrades: integer("closed_trades").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    sumReturn: doublePrecision("sum_return").notNull().default(0), // Σ realized return contributions
    // Shrunk, learned quality in ~[0,1] (Bayesian toward the neutral prior 0.5).
    quality: doublePrecision("quality").notNull().default(0.5),
    lastOutcomeAt: timestamp("last_outcome_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (t) => [uniqueIndex("actor_quality_uq").on(t.actor, t.kind)],
);

/** The model's weekly self-review: it reads its own recent reasoning traces against
 *  what actually happened and writes an honest critique + what it would change. */
export const selfReviews = pgTable("self_reviews", {
  id: serial("id").primaryKey(),
  account: text("account").notNull().default("paper"),
  periodStart: text("period_start").notNull(), // ISO date
  periodEnd: text("period_end").notNull(),
  grade: text("grade"), // model's self-assigned grade, e.g. B-
  summary: text("summary"), // one-paragraph verdict
  critique: text("critique"), // full self-critique
  changes: jsonb("changes"), // structured "what I'd change" list
  stats: jsonb("stats"), // the outcome numbers it was shown
  model: text("model"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
});

/** The morning briefing — a pleasant daily digest of what the brain saw, did, and
 *  why, plus portfolio state vs SPY. Narrated by the model, stored for the reader. */
export const briefings = pgTable(
  "briefings",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    account: text("account").notNull().default("paper"),
    headline: text("headline"),
    markdown: text("markdown").notNull(),
    stats: jsonb("stats"), // the numbers behind the prose
    model: text("model"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (t) => [uniqueIndex("briefing_date_acct_uq").on(t.date, t.account)],
);

/** Catalyst layer — free public convergence corroborators/refuters (government
 *  contract awards, lobbying spikes, committee calendar hearings). Each row lifts
 *  or dampens a ticker's thesis and is surfaced to the decision brain as evidence. */
export const catalysts = pgTable(
  "catalysts",
  {
    id: serial("id").primaryKey(),
    catalystId: text("catalyst_id").notNull(), // dedupe key
    ticker: text("ticker").notNull(),
    kind: text("kind").notNull(), // 'contract' | 'lobbying' | 'hearing'
    direction: text("direction").notNull().default("support"), // support | refute
    weight: doublePrecision("weight").notNull().default(0), // 0..1 magnitude
    headline: text("headline").notNull(),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    rawUrl: text("raw_url"),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("catalyst_uq").on(t.catalystId),
    index("catalyst_ticker_idx").on(t.ticker),
    index("catalyst_date_idx").on(t.date),
  ],
);
