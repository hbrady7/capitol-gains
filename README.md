# capitol-gains v2 — Convergence

An honest little experiment: **does an LLM trading on _convergence_ — names where
U.S. politicians and corporate insiders are buying the same stock at the same time —
beat the market, and beat a dumb mechanical version of the same signal?**

The brain runs **autonomously** on a GitHub Actions cron: **ingest → score → decide →
execute**. Claude (Opus 4.8 + extended thinking, via the Anthropic API) is the
portfolio manager — it picks the single best name, sizes it, and writes the
rationale. A thin deterministic **compliance desk** sits between the model and the
broker; it can only **halt or trim** an order, never originate one. A read-only
**Vercel dashboard** (on Neon Postgres) shows the reasoning, the decomposed score,
the portfolio, and a three-way scoreboard.

> **Paper mode is the default — nothing real is placed.** Live is flipped by a human
> in the dashboard Controls, never in code and never by the model. The signal is
> weeks-stale and the edge is thin. Not investment advice. Keep the repo **private**.

## How it works

```
ingest ─ congress feed (stock-watcher) + SEC EDGAR Form 4 (open-market buys, code P)
  │        → signals (congress|insider) + insider_filings
score  ─ Convergence Conviction Score (CCS): per-ticker congressional + insider
  │        sub-scores, super-additive convergence multiplier, liquidity gate
  │        → scored_candidates (every sub-score + evidence stored)
decide ─ Claude Opus 4.8 + extended thinking picks ONE buy (or holds)
  │        → decisions (full reasoning trace, confidence, thesis, risks)
execute─ compliance desk (block/trim only) → ExecutionAdapter.placeBuy
           → fills + positions, guardrail outcome recorded on the decision
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

## Run it

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL (Neon) + ANTHROPIC_API_KEY
npm run db:push               # create the schema on Neon
npm run dev                   # dashboard at http://localhost:3000

# the pipeline (each is an npm script run via tsx)
npm run ingest                # congress + EDGAR Form 4 → DB
npm run score                 # compute the CCS → scored_candidates
npm run decide                # Claude Opus 4.8 picks one buy or holds
npm run execute               # compliance desk → place (paper by default)
npm run baselines             # snapshot LLM / SPY / naive NAV for the scoreboard
npm run brain                 # all of the above in one process

npm run smoke                 # sanity checks (pure half needs no DB)
```

Offline-friendly: with `CONGRESS_SOURCE=seed` both feeds use deterministic seed data
(overlapping tickers, so the convergence multiplier is demonstrable without network).

## Automatic running (GitHub Actions)

Two scheduled workflows in `.github/workflows/` (both also run on demand via
`workflow_dispatch`, sharing a `brain` concurrency group):

- **analyze.yml** — `~12:00 UTC` weekdays: `ingest → score → decide`
- **execute.yml** — `~13:35 UTC` weekdays: `execute → baselines`

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
