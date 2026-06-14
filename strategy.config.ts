/**
 * strategy.config.ts — THE single source of truth for how capitol-gains behaves.
 *
 * These are the defaults. The settings UI persists overrides to the `settings`
 * table; `lib/settings.ts` merges (DB over defaults) so there is exactly one
 * resolved config at runtime. Change a default here; change live behavior in the
 * settings page. Nothing else should hardcode a tunable.
 *
 * Core principle: simple core, robust shell, human-gated execution, honest
 * scoreboard. No leverage, no options. The edge is thin and the data is weeks
 * stale — the config exists to keep you from blowing up, not to print money.
 */

export type SourceProvider = "seed" | "house-stock-watcher" | "senate-stock-watcher" | "finnhub";

export interface StrategyConfig {
  /** PAPER on first run — nothing real fires until you deliberately flip this. */
  paperMode: boolean;

  /** Empty = follow everyone. Otherwise only these members' disclosures surface. */
  membersToFollow: string[];

  sizing: {
    /** Default dollars per trade (pre-fills each card's size input). */
    dollarsPerTrade: number;
  };

  caps: {
    /** Hard ceiling on a single order. */
    maxPerTrade: number;
    /** Hard ceiling on total capital deployed across all positions. */
    maxTotalDeployed: number;
    /** Max fraction of account value in any one position (0–1). */
    maxPctPerPosition: number;
  };

  freshness: {
    /** days_stale <= green => fresh; <= amber => caution; beyond => stale (red). */
    greenMaxDays: number;
    amberMaxDays: number;
    /** Drop rows staler than this on ingest (absurdly old filings). */
    absurdStaleDays: number;
  };

  /** Halt new buys when account value is down more than this % from its peak. */
  drawdownHaltPct: number;

  exits: {
    /** Optional per-position stop loss / take profit (percent). 0 = disabled. */
    stopLossPct: number;
    takeProfitPct: number;
  };

  source: {
    provider: SourceProvider;
    /** Override the dataset/API URL if the default moves. Empty = adapter default. */
    url: string;
    /** Some sources (Finnhub) need a key; read from env, never hardcode. */
    apiKeyEnv: string;
  };
}

export const defaultConfig: StrategyConfig = {
  paperMode: true, // <-- safe default

  membersToFollow: [],

  sizing: {
    dollarsPerTrade: 250,
  },

  caps: {
    maxPerTrade: 500,
    maxTotalDeployed: 5000,
    maxPctPerPosition: 0.15,
  },

  freshness: {
    greenMaxDays: 14,
    amberMaxDays: 35,
    absurdStaleDays: 120,
  },

  drawdownHaltPct: 15,

  exits: {
    stopLossPct: 0,
    takeProfitPct: 0,
  },

  source: {
    provider: "seed", // works offline with zero setup; switch to a live source when ready
    url: "",
    apiKeyEnv: "CONGRESS_API_KEY",
  },
};
