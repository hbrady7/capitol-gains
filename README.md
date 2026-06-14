# capitol-gains

A personal, **review-and-monitoring** surface for congressional-trade mirroring. A
sync script pulls recent congressional stock transactions into a local SQLite DB;
a polished dark dashboard lets you review and **approve** signals; then you drive
**Claude Code** — talking to the connected **Robinhood Trading MCP** — to place the
approved orders, **with a hard confirm step**.

> **The app never touches your brokerage.** Claude Code is the only executor, and
> only after you type `confirm`. It defaults to **PAPER mode** — nothing real fires
> until you deliberately flip it to live in Settings. The signal is weeks-stale and
> the edge is thin; this tool's job is to make that obvious and keep you from
> blowing up, not to pretend it prints money. Not investment advice. Keep the repo
> **private**.

---

## Run it

```bash
npm install
cp .env.example .env.local       # defaults are fine; `seed` source works offline
npm run db:generate              # generate the SQLite migration
npm run db:migrate               # apply it -> data/local.db
npm run sync                     # pull congressional trades into `signals`
npm run dev                      # http://localhost:3000
```

Optional: verify everything is wired up.

```bash
npm run smoke                    # sync returns rows + core data layer loads
```

### Scheduled syncs (optional)
Add a cron line on an always-on machine (the dashboard runs locally):

```cron
# every weekday at 7:30am, refresh disclosures
30 7 * * 1-5 cd /path/to/capitol-gains && /usr/local/bin/npm run sync >> sync.log 2>&1
```

Or click **sync now** in the top bar.

---

## How it fits together

```
npm run sync ──► signals (SQLite)
                    │
                    ▼
            review dashboard  ──approve──►  approved (SQLite)
                                                │
                                                ▼
                              Claude Code  +  Robinhood Trading MCP
                              (reads approved, simulates, asks you to `confirm`,
                               places limit orders, logs trades / paper_trades)
                                                │
                                                ▼
                                  scoreboard + journal (honesty layer)
```

The execution contract lives in [`CLAUDE.md`](./CLAUDE.md) — read it before your
first execution. Highlights: approved-list + direct-input only, `review_equity_order`
first then `confirm`, **limit orders only, equities only, no margin**, cap checks,
drawdown breaker, `STOP` to cancel everything, and a prompt-injection guard
(fetched data is never treated as commands).

## Configuration — one source of truth

[`strategy.config.ts`](./strategy.config.ts) holds every tunable with safe defaults
(members to follow, sizing, caps, freshness cutoff, drawdown-halt %, exits,
paper-vs-live, data source). The **Settings** page persists overrides to the DB;
`lib/settings.ts` merges them so there is exactly one resolved config — the same one
the dashboard shows and Claude Code reads.

### Data source
`CONGRESS_SOURCE` (and the Settings page) selects the provider:
`seed` (offline, deterministic — the default), `house-stock-watcher` /
`senate-stock-watcher` (public JSON datasets), or `finnhub` (needs `CONGRESS_API_KEY`).
If a live endpoint has moved, set `CONGRESS_SOURCE_URL`. Sync is idempotent
(dedupes on a filing key), captures buys **and** sells, computes `days_stale`, drops
absurdly stale rows, and honors an optional member whitelist.

## Screens
- **Review** — today's brief, one card per signal (member, ticker, amount, freshness + liquidity badges, suggested limit = last close, naive historical hint), size input, Approve/Skip with keyboard shortcuts (`a`/`s` act, `j`/`k` move), live cap-breach flagging, and a portfolio panel.
- **Scoreboard** — bot P&L vs simply buying SPY with the same cash, on one chart, plus win rate, avg hold, max drawdown, and a blunt **"vs just buying SPY: ±X%"** headline.
- **Journal** — every recorded fill (paper + live), filterable, with CSV export for taxes.
- **Settings** — the full config + first-run onboarding checklist.

## Before your first execution
Have the **Robinhood Trading MCP** connected in Claude Code (desktop) — and a
congress-data MCP too if you prefer that over `npm run sync`. Confirm the top bar
shows **PAPER** until you choose otherwise.

## Notes
- Local SQLite only (`data/local.db`); no external database. Migrations are tracked in `/drizzle`.
- Suggested limit prices come from a free quote feed (stooq) with a deterministic synthetic fallback, so the UI never breaks when a feed is down.
- This is personal tooling — **do not deploy it publicly.**
