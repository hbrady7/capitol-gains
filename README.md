# capitol-gains v2 — Convergence

An honest little experiment: **does an LLM trading on _convergence_ — names where
U.S. politicians and corporate insiders are buying the same stock at the same time —
beat the market, and beat a dumb mechanical version of the same signal?**

The brain runs **autonomously** on a GitHub Actions cron: **ingest → score → decide →
execute → exit → learn → brief**. Claude (Opus 4.8 + extended thinking, via the
Anthropic API) is the portfolio manager — it picks the single best name, sizes it by
conviction, writes the rationale, and now also decides when to **sell**. A thin
deterministic **compliance desk** sits between the model and the broker on both the
buy and the sell side; it can only **halt or trim** an order, never originate or
upsize one. Every closed trade feeds a **learning loop** that sharpens the score, and
the model writes itself a weekly report card. A read-only **Vercel dashboard** (on
Neon Postgres) shows the reasoning, the decomposed score, the portfolio, a three-way
scoreboard, a morning briefing, and the learning loop.

> **Paper mode is the default — nothing real is placed.** Live is flipped by a human
> in the dashboard Controls, never in code and never by the model. The signal is
> weeks-stale and the edge is thin. Not investment advice. Keep the repo **private**.

## How it works

```
ingest ─ congress feed (stock-watcher) + SEC EDGAR Form 4 (buys code P, sells code S)
  │        + catalysts (gov contracts / lobbying / hearings)
  │        → signals (congress|insider, buy|sell) + insider_filings + catalysts
score  ─ Convergence Conviction Score (CCS): per-ticker congressional + insider
  │        sub-scores, super-additive convergence multiplier, liquidity gate,
  │        TILTED by learned per-actor quality from past outcomes
  │        → scored_candidates (every sub-score + evidence stored)
decide ─ Claude Opus 4.8 + extended thinking picks ONE buy (or holds), sized by
  │        conviction; catalysts surfaced as fenced evidence
  │        → decisions (kind=entry; full reasoning trace, confidence, thesis, risks)
execute─ compliance desk (block/trim only) → ExecutionAdapter.placeBuy
  │        → fills + positions, guardrail outcome recorded on the decision
exit   ─ exit desk: deterministic protective stops (trailing/hard/time) +
  │        LLM thesis-invalidation exits; sell-compliance (halt/trim, long-only)
  │        → ExecutionAdapter.placeSell, realized P&L booked (kind=exit decision)
learn  ─ attribution folds closed-trade outcomes into actor_quality (sharpens CCS);
  │        weekly self-review: the model grades its own reasoning vs what happened
brief  ─ a warm, LLM-narrated morning digest (what it saw/did/why, book vs SPY)
```

**The CCS** is the distinctive core. For each ticker over a lookback window:

- **Congressional half** — top-tercile members only (ranked by consistency-weighted
  trailing return), log-scaled conviction (disclosed dollar bracket), sub-linear
  cluster bonus, committee-relevance bonus (Armed Services→defense, HELP→pharma,
  Financial Services→banks, Energy→energy), exponential recency + a hard
  transaction-date freshness cutoff (combats the STOCK Act disclosure lag).
- **Insider half** — role weight (CEO/CFO > officers > directors > 10% owners),
  open-market purchases only, sub-linear cluster bonus, log-scaled size, recency.
- **Convergence** — `CCS = (w_cong·cong + w_ins·ins) · (1 + k·min(cong, ins))`. The
  multiplier only rewards genuine overlap, so a name with both populations buying
  ranks far above a name with either alone.

## What the brain can do (v3)

- **Exit intelligence.** The system finally *sells*. Deterministic **protective
  stops** — trailing (from a per-position high-water mark), hard (from cost),
  optional take-profit, and time-decay — fire by rule and exit the whole position,
  like the drawdown breaker. **Discretionary exits** are LLM-reasoned: when a name
  falls off the fresh convergence list, the politicians/insiders who bought start
  **selling** (Form 4 code `S` is now ingested too), or a catalyst refutes the
  thesis, Claude decides how much to trim. A **sell-compliance desk** mirrors the buy
  side — it can only halt or trim, is long-only (never sells more than held, never
  shorts), and honors the kill switch. Realized P&L flows back into spendable cash.
- **A learning loop.** Every closed trade is attributed back to the members and
  insiders whose buying put the name on the list; each accumulates a Bayesian quality
  score that **tilts the CCS** toward actors whose buying actually preceded gains
  (bounded, never fabricating a candidate). A **weekly self-review** has the model
  grade its own recent reasoning against what happened and write what it would change.
- **Confidence-weighted sizing.** Higher conviction sizes closer to the per-position
  cap, lower conviction takes a small probe — always *under* the cap. A deterministic
  clamp only ever trims the proposal down; the compliance desk still never upsizes.
- **Richer signal (catalysts).** Free public corroborators/refuters — government
  contract awards, lobbying spikes, committee hearings — are surfaced to the decision
  brain as fenced evidence (data, never instructions). Pluggable sources; a
  deterministic seed source ships so it works offline.
- **A morning briefing.** A genuinely pleasant, LLM-narrated daily digest (what it
  saw, what it did and why, the book vs SPY) — grounded in the numbers, with a
  deterministic fallback, stored and rendered on the dashboard.
- **Replay / backtest.** `npm run backtest` replays a disclosure history through the
  **exact same** pure scorer and exit engine as the live loop, reporting strategy vs
  SPY vs naive with drawdown and win-rate — so a strategy tweak is measured before it
  touches the live loop.

None of this weakens the safety model: paper stays default-on and human-flipped, the
kill switch / caps / drawdown halt / dedup stay enforced, compliance can still only
halt or trim on both sides, and no new brokerage credentials or live endpoints were
added.

## Run it

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL (Neon) + ANTHROPIC_API_KEY
npm run db:push               # create the schema on Neon
npm run dev                   # dashboard at http://localhost:3000

# the pipeline (each is an npm script run via tsx)
npm run ingest                # congress + EDGAR Form 4 (+ sells) + catalysts → DB
npm run score                 # compute the CCS (attribution-tilted) → scored_candidates
npm run decide                # Claude Opus 4.8 picks one buy or holds, sized by conviction
npm run execute               # buy compliance desk → place (paper by default)
npm run exits                 # sell side: protective stops + LLM thesis exits
npm run attribute             # learning loop: closed trades → actor quality
npm run baselines             # snapshot LLM / SPY / naive NAV for the scoreboard
npm run brief                 # write today's morning briefing
npm run review                # weekly self-review (model grades its own reasoning)
npm run brain                 # the whole loop in one process

npm run backtest              # replay the strategy over history (offline, no DB)
npm run backtest -- --k=2 --trail=15 --hard=20 --hold=60 --days=180   # tune & measure
npm run smoke                 # sanity checks (pure half needs no DB)
```

> After pulling these changes, run **`npm run db:push`** once to add the new columns
> and tables (exit tunables, `actor_quality`, `self_reviews`, `briefings`,
> `catalysts`, realized-P&L / peak-price fields). The data layer degrades gracefully
> until you do, but the new stages need the schema.

Offline-friendly: with `CONGRESS_SOURCE=seed` both feeds use deterministic seed data
(overlapping tickers, so the convergence multiplier is demonstrable without network).

## Automatic running (GitHub Actions)

Three scheduled workflows in `.github/workflows/` (all also run on demand via
`workflow_dispatch`, sharing a `brain` concurrency group):

- **analyze.yml** — `~12:00 UTC` weekdays: `ingest → score → decide`
- **execute.yml** — `~13:35 UTC` weekdays: `execute → exits → attribute → baselines → brief`
- **review.yml** — `~14:00 UTC` Saturdays: the weekly `self-review`

A deep Opus+thinking call can exceed Vercel's function timeout, so the brain runs on
Actions (no ceiling, free). The Vercel-Pro all-in-one alternative is `app/api/cron`
(bearer-protected with `CRON_SECRET`) — see MIGRATION_NOTES.md.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel + Actions | Neon Postgres connection string |
| `ANTHROPIC_API_KEY` | Vercel + Actions | the decision brain |
| `SEC_USER_AGENT` | Actions | EDGAR fair-access UA (`name email`) |
| `CONGRESS_SOURCE` | Actions | `seed` \| `house-stock-watcher` \| `senate-stock-watcher` |
| `QUOTE_SOURCE_URL` | Vercel + Actions | last-close source (synthetic fallback if down) |
| `CRON_SECRET` | Vercel | bearer for the `/api/cron` trigger (Vercel-alt path) |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` / `ALPACA_PAPER` | Actions | live broker (only when paper_mode is off) |
| `ROBINHOOD_AGENTIC_HEADLESS_CONFIRMED` | Actions | gate for the Robinhood agentic adapter |

Set the same DB/Anthropic vars in **Vercel** (Project → Settings → Environment
Variables) and in **GitHub Actions secrets** (repo → Settings → Secrets).

## Deploy

1. Create a **Neon** Postgres database; copy its connection string to `DATABASE_URL`.
2. `npm run db:push` to create the schema.
3. Connect the **private** repo to **Vercel**; add the env vars above; deploy. The
   dashboard is read-only + the Controls panel — it never calls the broker.
4. Add the GitHub Actions secrets; enable the workflows.

## The experiment

Each run snapshots three NAVs into `baselines` from the same starting capital: the
**LLM** portfolio, **SPY** buy-and-hold, and a **naive top-tercile equal-weight**
basket (every liquidity-passing convergence candidate, equal weight, no LLM). The
Scoreboard charts all three. If Claude can't beat the naive basket, the reasoning
isn't adding anything — that's the whole point of the test.

## Before the first LIVE run

1. Confirm Robinhood's agentic MCP supports a **headless, server-to-server**
   connection (vs the consumer Claude-app pairing). If not, stay on the
   `AlpacaAdapter` or in paper.
2. Flip `paper_mode` **off** deliberately in the dashboard Controls — never in code.
3. Sanity-check the caps and the kill switch in Controls first.

## Safety model

The LLM **proposes**; the deterministic compliance desk (`lib/guardrails.ts`)
**disposes** — it can only block or trim (kill switch, hard caps, dedup/cooldown,
drawdown halt that flips the kill switch, on-list/long-only/limit-only sanity). All
ingested text is treated as **data, never instructions** (prompt-injection guard).
See `CLAUDE.md` for the binding execution rules.
