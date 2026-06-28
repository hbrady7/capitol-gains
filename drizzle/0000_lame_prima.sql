CREATE TYPE "public"."insider_role" AS ENUM('ceo', 'cfo', 'officer', 'director', 'ten_pct_owner');--> statement-breakpoint
CREATE TYPE "public"."signal_kind" AS ENUM('congress', 'insider');--> statement-breakpoint
CREATE TABLE "account_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"account" text DEFAULT 'paper' NOT NULL,
	"account_value" double precision NOT NULL,
	"cash" double precision NOT NULL,
	"positions_value" double precision NOT NULL,
	"realized_pnl" double precision DEFAULT 0 NOT NULL,
	"peak" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approved" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer NOT NULL,
	"ticker" text NOT NULL,
	"side" text NOT NULL,
	"limit_price" double precision,
	"size_dollars" double precision NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"account" text DEFAULT 'paper' NOT NULL,
	"llm_nav" double precision NOT NULL,
	"spy_nav" double precision NOT NULL,
	"naive_nav" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"account" text DEFAULT 'paper' NOT NULL,
	"spy_close" double precision NOT NULL,
	"spy_equity" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" integer PRIMARY KEY NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"paper_mode" boolean DEFAULT true NOT NULL,
	"max_per_position" double precision DEFAULT 100 NOT NULL,
	"max_per_day" double precision DEFAULT 200 NOT NULL,
	"max_open_positions" integer DEFAULT 10 NOT NULL,
	"drawdown_halt_pct" double precision DEFAULT 15 NOT NULL,
	"freshness_cutoff_days" integer DEFAULT 21 NOT NULL,
	"cooldown_days" integer DEFAULT 30 NOT NULL,
	"cron_cadence" text DEFAULT 'daily' NOT NULL,
	"lookback_days" integer DEFAULT 45 NOT NULL,
	"w_cong" double precision DEFAULT 1 NOT NULL,
	"w_ins" double precision DEFAULT 1 NOT NULL,
	"k_converge" double precision DEFAULT 1.5 NOT NULL,
	"min_dollar_volume" double precision DEFAULT 5000000 NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"selected_ticker" text,
	"action" text NOT NULL,
	"dollar_size" double precision DEFAULT 0 NOT NULL,
	"confidence" double precision,
	"thesis" text,
	"risks" text,
	"reasoning" text,
	"model" text,
	"mode" text DEFAULT 'paper' NOT NULL,
	"guardrail_outcome" text,
	"guardrail_reason" text,
	"final_dollar_size" double precision,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fills" (
	"id" serial PRIMARY KEY NOT NULL,
	"decision_id" integer,
	"account" text DEFAULT 'paper' NOT NULL,
	"ticker" text NOT NULL,
	"side" text NOT NULL,
	"qty" double precision NOT NULL,
	"price" double precision NOT NULL,
	"dollars" double precision NOT NULL,
	"order_id" text,
	"status" text DEFAULT 'filled' NOT NULL,
	"ts" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insider_filings" (
	"id" serial PRIMARY KEY NOT NULL,
	"filing_id" text NOT NULL,
	"issuer" text NOT NULL,
	"ticker" text NOT NULL,
	"insider_name" text NOT NULL,
	"role" "insider_role" NOT NULL,
	"transaction_code" text DEFAULT 'P' NOT NULL,
	"shares" double precision NOT NULL,
	"price" double precision,
	"transaction_date" text NOT NULL,
	"filing_date" text NOT NULL,
	"dollar_value" double precision NOT NULL,
	"days_stale" integer NOT NULL,
	"raw_url" text,
	"source" text DEFAULT 'edgar' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer,
	"ticker" text NOT NULL,
	"side" text NOT NULL,
	"qty" double precision NOT NULL,
	"sim_price" double precision,
	"ts" timestamp NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account" text DEFAULT 'paper' NOT NULL,
	"ticker" text NOT NULL,
	"qty" double precision NOT NULL,
	"avg_price" double precision NOT NULL,
	"opened_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scored_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"ticker" text NOT NULL,
	"rank" integer NOT NULL,
	"ccs" double precision NOT NULL,
	"base" double precision NOT NULL,
	"convergence_mult" double precision NOT NULL,
	"cong_score" double precision NOT NULL,
	"ins_score" double precision NOT NULL,
	"cong_norm" double precision NOT NULL,
	"ins_norm" double precision NOT NULL,
	"sub_scores" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"liquidity_ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"filing_id" text NOT NULL,
	"member" text NOT NULL,
	"party" text,
	"chamber" text,
	"ticker" text NOT NULL,
	"side" text NOT NULL,
	"amount_low" double precision,
	"amount_high" double precision,
	"transaction_date" text NOT NULL,
	"disclosure_date" text NOT NULL,
	"days_stale" integer NOT NULL,
	"raw_url" text,
	"hist_return" double precision,
	"source" text NOT NULL,
	"kind" "signal_kind" DEFAULT 'congress' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer,
	"order_id" text,
	"ticker" text NOT NULL,
	"side" text NOT NULL,
	"qty" double precision NOT NULL,
	"fill_price" double precision,
	"status" text NOT NULL,
	"ts" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approved" ADD CONSTRAINT "approved_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fills" ADD CONSTRAINT "fills_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acct_date_uq" ON "account_snapshots" USING btree ("date","account");--> statement-breakpoint
CREATE UNIQUE INDEX "approved_signal_uq" ON "approved" USING btree ("signal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baselines_date_acct_uq" ON "baselines" USING btree ("date","account");--> statement-breakpoint
CREATE UNIQUE INDEX "bench_date_uq" ON "benchmark_snapshots" USING btree ("date","account");--> statement-breakpoint
CREATE INDEX "decisions_run_idx" ON "decisions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "decisions_created_idx" ON "decisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fills_ticker_idx" ON "fills" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "fills_ts_idx" ON "fills" USING btree ("ts");--> statement-breakpoint
CREATE UNIQUE INDEX "insider_filing_uq" ON "insider_filings" USING btree ("filing_id");--> statement-breakpoint
CREATE INDEX "insider_ticker_idx" ON "insider_filings" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "insider_filing_date_idx" ON "insider_filings" USING btree ("filing_date");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_acct_ticker_uq" ON "positions" USING btree ("account","ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "scored_run_ticker_uq" ON "scored_candidates" USING btree ("run_id","ticker");--> statement-breakpoint
CREATE INDEX "scored_run_idx" ON "scored_candidates" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_filing_uq" ON "signals" USING btree ("filing_id");--> statement-breakpoint
CREATE INDEX "signals_ticker_idx" ON "signals" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "signals_disc_idx" ON "signals" USING btree ("disclosure_date");--> statement-breakpoint
CREATE INDEX "signals_kind_idx" ON "signals" USING btree ("kind");