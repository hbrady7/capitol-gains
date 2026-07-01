CREATE TABLE "actor_quality" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"kind" "signal_kind" NOT NULL,
	"closed_trades" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"sum_return" double precision DEFAULT 0 NOT NULL,
	"quality" double precision DEFAULT 0.5 NOT NULL,
	"last_outcome_at" timestamp,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"account" text DEFAULT 'paper' NOT NULL,
	"headline" text,
	"markdown" text NOT NULL,
	"stats" jsonb,
	"model" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalysts" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalyst_id" text NOT NULL,
	"ticker" text NOT NULL,
	"kind" text NOT NULL,
	"direction" text DEFAULT 'support' NOT NULL,
	"weight" double precision DEFAULT 0 NOT NULL,
	"headline" text NOT NULL,
	"date" text NOT NULL,
	"raw_url" text,
	"source" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "self_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"account" text DEFAULT 'paper' NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"grade" text,
	"summary" text,
	"critique" text,
	"changes" jsonb,
	"stats" jsonb,
	"model" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "exits_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "trailing_stop_pct" double precision DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "hard_stop_pct" double precision DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "take_profit_pct" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "max_hold_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "confidence_sizing" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "kind" text DEFAULT 'entry' NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "sell_qty" double precision;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "sell_fraction" double precision;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "exit_triggers" jsonb;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "realized_pnl" double precision;--> statement-breakpoint
ALTER TABLE "fills" ADD COLUMN "realized_pnl" double precision;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "peak_price" double precision;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "thesis" text;--> statement-breakpoint
CREATE UNIQUE INDEX "actor_quality_uq" ON "actor_quality" USING btree ("actor","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "briefing_date_acct_uq" ON "briefings" USING btree ("date","account");--> statement-breakpoint
CREATE UNIQUE INDEX "catalyst_uq" ON "catalysts" USING btree ("catalyst_id");--> statement-breakpoint
CREATE INDEX "catalyst_ticker_idx" ON "catalysts" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "catalyst_date_idx" ON "catalysts" USING btree ("date");--> statement-breakpoint
CREATE INDEX "decisions_kind_idx" ON "decisions" USING btree ("kind");