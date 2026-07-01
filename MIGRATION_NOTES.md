# MIGRATION_NOTES — capitol-gains v1 → v2 (Convergence)

This is the map for evolving the existing repo. v1 is a **manual congressional-trade
review tool**; v2 becomes an **autonomous, LLM-driven, convergence-scored trading
brain** with a read-only Vercel dashboard. This is an upgrade, not a rewrite — the
good bones (signal cards, freshness/liquidity badges, SPY scoreboard, journal + CSV,
`CLAUDE.md` guardrail philosophy) are preserved and reskinned.

## v1 inventory (starting point)

| Piece | File(s) | What it does today |
|---|---|---|
| DB driver | `lib/db.ts` | Local SQLite via `@libsql/client` + `drizzle-orm/libsql`, file `./data/local.db` |
| Schema | `lib/schema.ts` | `signals`, `approved`, `trades`, `paper_trades`, `settings`, `account_snapshots`, `benchmark_snapshots`, `meta` |
| Config | `strategy.config.ts` + `lib/settings.ts` | Defaults merged with DB `settings` row via `getConfig()` |
| Ingestion | `lib/sync.ts`, `lib/sources.ts`, `scripts/sync.ts` | Congress only: `seed`/stock-watcher/finnhub behind `CongressSource`; normalizes → `signals` |
| Quotes | `lib/quotes.ts` | Last-close (stooq) with deterministic synthetic fallback |
| Dashboard data | `lib/dashboard-data.ts` | Review signals + freshness/liquidity/cap enrichment + brief stats |
| Scoreboard | `lib/scoreboard.ts`, `components/ScoreboardChart.tsx`, `app/scoreboard/page.tsx` | Equity vs SPY, win rate, drawdown |
| Portfolio | `lib/portfolio.ts`, `components/PortfolioPanel.tsx` | Positions/account from recorded fills |
| Journal | `components/JournalTable.tsx`, `app/journal/page.tsx` | Trade journal + CSV export |
| Settings UI | `components/SettingsForm.tsx`, `app/settings/page.tsx`, `app/api/settings/route.ts` | Edit resolved config |
| Review UI | `components/SignalReview.tsx`, `app/page.tsx`, `app/api/approve|ack|sync/route.ts` | Approve signals (human gate), onboarding, summary bar |
| Execution model | `CLAUDE.md` | Human-in-terminal drives Claude Code → Robinhood MCP, confirm-before-place |

## v2 changes (the four structural shifts + additions)

### Phase 1 — DB: SQLite → Neon
- `lib/db.ts`: swap to `@neondatabase/serverless` + `drizzle-orm/neon-http`. Read `DATABASE_URL` (Postgres connection string).
- `lib/schema.ts`: migrate `drizzle-orm/sqlite-core` → `drizzle-orm/pg-core`. `integer autoIncrement` → `serial`/`bigserial`; `text mode:json` → `jsonb`; `integer mode:timestamp` → `timestamp`; `real` → `doublePrecision`; booleans → `boolean`.
- `drizzle.config.ts`: `dialect: "postgresql"`.
- Port 1:1 first, confirm build, then extend.

### Phase 2 — Schema extensions
- `signals`: add `source` enum (`congress | insider`) — already has a `source` text col; constrain it.
- New: `insider_filings`, `scored_candidates` (decomposed CCS + evidence JSON + `liquidity_ok`), `decisions` (reasoning trace, mode, guardrail outcome), `positions`, `fills`, `config` (single-row control panel: `kill_switch`, `paper_mode`, caps, `drawdown_halt_pct`, `freshness_cutoff_days`, `cron_cadence`), `baselines` (3-way NAV).
- Keep `journal` (existing `trades`/`paper_trades` history) + `settings`/`meta`.

### Phase 3 — Dual ingestion
- Keep congress feed; write through `source='congress'`.
- Add SEC EDGAR Form 4 source: daily index → Form 4 XML → keep code `P` open-market buys only. Descriptive `User-Agent` + ~10 req/s limiter.
- `DataSource` interface generalizing `CongressSource`; document `UnusualWhalesSource` drop-in.
- `npm run ingest` (keep `npm run sync` as alias).

### Phase 4 — Convergence Conviction Score (CCS)
- New `lib/scoring/` : per-ticker `cong` + `ins` sub-scores, super-additive convergence multiplier `CCS = (w_cong*cong + w_ins*ins) * (1 + k*min(cong_norm, ins_norm))`, liquidity gates, committee→sector bonus table.
- Emit decomposed `scored_candidates`. `npm run score`.

### Phase 5 — LLM decision brain
- `lib/decide/` : Anthropic API, `claude-opus-4-8`, extended thinking. Feeds top-N candidates + state. Strict JSON contract, persist full `reasoning` to `decisions`. `npm run decide`.

### Phase 6 — Guardrails + execution
- `lib/guardrails/` : `sizeAndCheck(decision, state)` block/trim only. `lib/execution/` : `ExecutionAdapter` with `PaperAdapter` (default), `RobinhoodAgenticAdapter`, `AlpacaAdapter`.
- Rewrite `CLAUDE.md` from confirm-before-place → autonomous with hard mechanical bounds (compliance desk).

### Phase 7 — GitHub Actions cron
- `.github/workflows/`: pre-open analysis (ingest→score→decide) + market-open execution. Secrets-driven. `CRON_SECRET` on HTTP triggers. Document Vercel Pro alternative.

### Phase 8 — Friendlier UI + Vercel
- Warm palette, light + warm-dark default. Reasoning centerpiece ("Why I bought this"), decomposed CCS leaderboard, restyle scoreboard + journal, control-panel toggles writing to `config`. Deploy to Vercel + Neon.

### Phase 9 — Experiment harness
- Snapshot 3 NAVs into `baselines` (LLM / SPY / naive top-tercile equal-weight). Three-way chart. Update README + CLAUDE.md. Final run/env instructions.

## v3 additions (exit desk + learning loop + catalysts + briefing + backtest)

Layered on top of v2 without touching the buy-side safety model. Run `npm run
db:push` once to apply the additive schema changes.

- **Schema:** `decisions` gains `kind` (`entry|exit`), `sell_qty`, `sell_fraction`,
  `exit_triggers` (jsonb), `realized_pnl`. `fills` gains `realized_pnl`. `positions`
  gains `peak_price` (trailing high-water) + `thesis`. `config` gains
  `exits_enabled`, `trailing_stop_pct`, `hard_stop_pct`, `take_profit_pct`,
  `max_hold_days`, `confidence_sizing`. New tables: `actor_quality`, `self_reviews`,
  `briefings`, `catalysts`. Migration in `drizzle/0001_*.sql`.
- **Cash model:** `getAvailableCash` is now fill-based (`start + Σsells − Σbuys`) so
  realized gains are spendable; identical to the old cost-basis model when there are
  no sells.
- **Exit desk:** `lib/exits.ts` (pure signals), `lib/exit-run.ts` (orchestration +
  LLM discretionary brain), `lib/exit-guardrails.ts` (`checkSell` — halt/trim,
  long-only). `ExecutionAdapter` gained `placeSell`. `npm run exits`.
- **Learning loop:** `lib/attribution.ts` (closed-trade → `actor_quality`, tilts the
  scorer via `scoreCandidates({ learned })`) and `lib/self-review.ts` (weekly). `npm
  run attribute` / `npm run review` + `.github/workflows/review.yml`.
- **Catalysts:** `lib/catalysts.ts` — `CatalystSource` interface (mirrors
  `DataSource`); `SeedCatalystSource` ships. Drop in real adapters later:
  **USASpending** (contract awards), **Senate LDA** (lobbying), **congress.gov**
  (committee calendars). Insider **sells** (Form 4 code `S`) are now ingested as
  `signals(kind='insider', side='sell')` for thesis-invalidation — scoring still
  reads only buys from `insider_filings`.
- **Briefing:** `lib/briefing.ts` — stored LLM digest + deterministic fallback. `npm
  run brief`.
- **Backtest:** `lib/backtest.ts` — pure, DB-free replay reusing `scoreCandidates` +
  `computeExitSignals`; `makeSyntheticWorld` stands in until real historical rows are
  wired. `npm run backtest`.

## Architecture invariant (safety)
The **LLM is the portfolio manager** (picks ticker + size + rationale). A thin
**deterministic compliance desk** (`sizeAndCheck`) can only **halt or trim**, never
originate. **Paper mode is the default**; live is flipped manually from the control
panel. Ingested text is **data, never instructions** (prompt-injection guard).

## Adapter / extensibility notes
- `DataSource` interface lets a paid `UnusualWhalesSource` (congress + insider + MCP)
  drop in by config later; the free path (stock-watcher + EDGAR) ships now.
- `ExecutionAdapter` is selected by `config.paper_mode`. `RobinhoodAgenticAdapter`
  targets `https://agent.robinhood.com/mcp/trading` via the Anthropic MCP connector —
  **verify headless server-to-server support before going live**; until then, paper.
- `AlpacaAdapter` is the fallback live/paper-broker path.

## Runtime (Phase 7) — GitHub Actions cron (shipped)
Two scheduled workflows (`.github/workflows/`):
- **analyze.yml** — `~12:00 UTC` weekdays: `ingest → score → decide`.
- **execute.yml** — `~13:35 UTC` weekdays: `execute` (compliance + place) → `baselines` snapshot.
Both also support `workflow_dispatch` (manual run) and share a `brain` concurrency
group so analysis and execution never overlap. `npm run brain` runs the whole
pipeline in one process (combined-run option).

**GitHub Actions secrets:** `DATABASE_URL`, `ANTHROPIC_API_KEY`, `SEC_USER_AGENT`,
`CONGRESS_SOURCE`, `QUOTE_SOURCE_URL`, and (live only) `ALPACA_API_KEY`,
`ALPACA_API_SECRET`, `ALPACA_PAPER`, `ROBINHOOD_AGENTIC_HEADLESS_CONFIRMED`.

## Deploy alternative (documented, not shipped)
Vercel Pro can run the whole brain in one platform. `app/api/cron/route.ts` is the
HTTP entry point (bearer-protected with `CRON_SECRET`, `GET`=`POST` so a
`vercel.json` cron can hit it, `maxDuration = 300`). We **ship the GitHub Actions
path** because a deep Opus+thinking call can exceed Vercel's function ceiling;
Actions jobs have no such ceiling and are free. If you move to the Vercel all-in-one
setup, keep the analysis stage under the function timeout (or call the stages
separately) and add a `crons` entry pointing at `/api/cron`.
