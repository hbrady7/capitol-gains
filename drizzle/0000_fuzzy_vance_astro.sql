CREATE TABLE `account_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`account` text DEFAULT 'paper' NOT NULL,
	`account_value` real NOT NULL,
	`cash` real NOT NULL,
	`positions_value` real NOT NULL,
	`realized_pnl` real DEFAULT 0 NOT NULL,
	`peak` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `acct_date_uq` ON `account_snapshots` (`date`,`account`);--> statement-breakpoint
CREATE TABLE `approved` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`side` text NOT NULL,
	`limit_price` real,
	`size_dollars` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_at` integer NOT NULL,
	FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approved_signal_uq` ON `approved` (`signal_id`);--> statement-breakpoint
CREATE TABLE `benchmark_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`account` text DEFAULT 'paper' NOT NULL,
	`spy_close` real NOT NULL,
	`spy_equity` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bench_date_uq` ON `benchmark_snapshots` (`date`,`account`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paper_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` integer,
	`ticker` text NOT NULL,
	`side` text NOT NULL,
	`qty` real NOT NULL,
	`sim_price` real,
	`ts` integer NOT NULL,
	`raw` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filing_id` text NOT NULL,
	`member` text NOT NULL,
	`party` text,
	`chamber` text,
	`ticker` text NOT NULL,
	`side` text NOT NULL,
	`amount_low` real,
	`amount_high` real,
	`transaction_date` text NOT NULL,
	`disclosure_date` text NOT NULL,
	`days_stale` integer NOT NULL,
	`raw_url` text,
	`hist_return` real,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signals_filing_uq` ON `signals` (`filing_id`);--> statement-breakpoint
CREATE INDEX `signals_ticker_idx` ON `signals` (`ticker`);--> statement-breakpoint
CREATE INDEX `signals_disc_idx` ON `signals` (`disclosure_date`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` integer,
	`order_id` text,
	`ticker` text NOT NULL,
	`side` text NOT NULL,
	`qty` real NOT NULL,
	`fill_price` real,
	`status` text NOT NULL,
	`ts` integer NOT NULL
);
