# The Professional — Trading Journal & Screener

A personal trading journal and **Qullamaggie + Momentum** equity screener for US & Vietnam markets, by Dr. Tu Anh Pham.

The public-facing site is an editorial blog; the screener tools are private, unlocked by invite code.

The entire project lives in **`screener-ts/`** — a TypeScript monorepo that runs as a local web app, ships as a macOS desktop app (Tauri v2), deploys as a $0 static site (Cloudflare Pages), and installs as a PWA. All business logic is in a platform-agnostic core (`packages/core`); the desktop app (`apps/desktop`) provides the UI and data adapters.

> Educational use only. Not financial advice.

---

## Table of contents

1. [Public vs private](#public-vs-private)
2. [Quick start](#quick-start--run-it-locally-no-rust-any-os)
3. [Use it on your phone (PWA)](#use-it-on-your-phone-pwa)
4. [How the Quality Score works](#how-the-quality-score-works)
5. [Scan coverage — which stocks are scanned?](#scan-coverage--which-stocks-are-scanned)
6. [Why doesn't stock X show up?](#why-doesnt-stock-x-show-up)
7. [Features](#features)
8. [Deploy to Cloudflare Pages](#deploy-as-a-0-static-site-cloudflare-pages)
9. [Cross-device sync (Cloudflare D1)](#cross-device-sync-cloudflare-d1)
10. [Build the native macOS app](#build-the-native-macos-app-needs-rust--tauri-prereqs)
11. [Project layout](#project-layout)
12. [Run the tests](#run-the-tests)
13. [Swapping the data provider](#swapping-the-data-provider)
14. [Known limitations](#known-limitations)

---

## Public vs private

The site has two layers:

| Layer | Who can see it | What's there |
|---|---|---|
| **Public** | Anyone | Editorial landing · `01 Analysis` blog · `02 About` narrative · `03 Private tools` gate |
| **Private** | Invite code only | Top Picks · Screener · Sectors · Watchlists · Paper Trading · Backtest · Playbook · Case Studies · Learn · Analysis editor |

### How the gate works

Set `VITE_ACCESS_CODES` in your `.env` (or as a Cloudflare Pages environment variable) to a comma-separated list of invite codes:

```
VITE_ACCESS_CODES=mycode,friendcode
```

- First visit prompts for the code → stores `auth_unlocked=1` in `localStorage` → never asked again on that device.
- Correct code enters the app; wrong code shows an error.
- Leave the variable **empty or unset** for fully open access (useful for local dev).

To revoke someone, remove their code from the variable and redeploy.

> This is a soft client-side gate — it keeps casuals out, not a cryptographic lock. Treat it like a shared password for a private circle.

### Public blog

The Analysis blog (`posts/*.md`) is fully public — posts render on the landing page without any code. The private app adds a write/edit/delete interface on top of the same posts. To publish a new post to everyone:

1. Write it in the in-app editor → `⬇ Download .md`
2. Drop the file into `screener-ts/apps/desktop/posts/`
3. Commit and redeploy

---

## Quick start — run it locally (no Rust, any OS)

```bash
cd screener-ts
npm install
npm run dev:desktop        # → open http://localhost:1420
```

No core build step needed. `vite.config.ts` aliases `@screener/core` to its TypeScript source (Vite compiles it on the fly) and runs dev proxies for `/api/yahoo`, `/api/finnhub`, and `/api/wiki`, so the browser fetches **live data** with no Cloudflare deploy and no Tauri/Rust.

The editorial landing loads first. The `01 Analysis` section shows public posts. Click **"Private tools →"** to enter the access code and reach the screener.

> **Notes**
> - First **Top Picks** / **Sectors** scan fetches the curated universe (~540 tickers) and can take a minute; single-stock views are instant. Results cache.
> - The dev proxy applies to `vite dev` only — not `vite preview` of the build.
> - **After changing `packages/core`**, restart dev with `npm run dev:desktop -- --force` and hard-refresh (Cmd/Ctrl+Shift+R) to clear Vite's dep cache.

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node | ≥ 20 | everything |
| Rust + Cargo | stable ([rustup.rs](https://rustup.rs)) | native desktop build only |
| Tauri system deps | [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites) | native desktop build only |

---

## Use it on your phone (PWA)

The web build is a **Progressive Web App** — deploy it once, then "Add to Home Screen" on your phone and it runs full-screen like a native app, free, no App Store, no Apple Developer fee.

1. **Deploy** (see [Cloudflare Pages](#deploy-as-a-0-static-site-cloudflare-pages)):
   ```bash
   cd screener-ts
   npm run build --workspace @screener/core
   npm run build --workspace @screener/desktop
   cd apps/desktop
   npx wrangler pages deploy dist --project-name the-professional
   ```
2. **Install on the phone** (open the deployed URL):
   - **iPhone (Safari):** Share → **Add to Home Screen**.
   - **Android (Chrome):** menu → **Install app**.

The layout is mobile-responsive: on phones the nav collapses into a hamburger dropdown, content goes full-width, tables scroll horizontally, and the stock detail becomes a full-screen sheet. iPhone notch / home-indicator safe areas are respected. The service worker caches the app shell for instant / offline launch but **never caches `/api/*`**, so stock data stays live. A full step-by-step guide (in Vietnamese) is in [`apps/desktop/INSTALL_ON_PHONE.md`](screener-ts/apps/desktop/INSTALL_ON_PHONE.md).

---

## How the Quality Score works

Every stock gets a **0–100 quality score** (part of the Qullamaggie/QM module). It measures how tightly a stock is **coiled in a low-volatility base near a breakout** right now. A high score = a clean technical setup. The rubric (see [`packages/core/src/qm/`](screener-ts/packages/core/src/qm/)):

| Component | Points | Meaning |
|---|---|---|
| **Stage** | +25 / +10 / 0 | Stage 2 (advancing) **+25** · Stage 1 (basing) **+10** · otherwise 0 |
| **ATR volatility contraction** | 0 → +20 | The more daily range tightens, the better. **No lower clamp** — expanding volatility goes **negative**. |
| **Price-range tightness** | 0 → +15 | Tighter base = higher (5% range → +15, 30% → 0). |
| **Volume dry-up** | 0 → +15 | Volume drying up through the base (maxes around 40%). |
| **VCP contractions** | 0 → +15 | +5 per successive (tighter) contraction, capped at 3. |
| **Proximity to pivot** | 0 → +10 | Closer to the breakout pivot = higher (within 5%). |

```
score = Stage + ATR + Range + Volume + VCP + Pivot
score = round(min(score, 100), 1)   # capped at ≤ 100, but NOT clamped at ≥ 0
```

Because the ATR term has **no lower clamp**, a stock whose volatility is expanding can score **negative** — correct behavior, not a bug. This explainer is also shown in-app on the **Learn** tab (bilingual).

---

## Scan coverage — which stocks are scanned?

| Mode | Size | Source | When |
|---|---|---|---|
| **Curated** | ~543 names | bundled `SECTOR_STOCKS` | default for Top Picks / Sectors (fast) |
| **Broad** | ~1500 names | S&P 500 + 400 + 600 scraped from Wikipedia | **Broad** toggle in Top Picks (slower) |

Any ticker **outside** these lists can still be analyzed — just type it into the **Screener**.

---

## Why doesn't stock X show up?

- **Top Picks score thresholds:** Breakout needs **score ≥ 70**, Momentum **≥ 55**, VCP **≥ 60**. A large-cap not in a tight base (e.g. MSFT) scores below the threshold by design. Use the **Screener** to see it regardless.
- **Screener "Min score" filter:** leave it **blank** for no limit (blank = −∞ floor).
- **Fetch failures:** Yahoo rate-limits cause some symbols to be silently dropped. The status line says "N couldn't be fetched … click Run to retry".
- **Too little history:** symbols with **< 60 bars** are skipped.

---

## Features

### Public (no code required)
- **Editorial landing** — numbered sections (`01 Analysis`, `02 About`, `03 Private tools`), personal narrative, live blog posts loaded from `posts/*.md`.
- **Analysis blog** — published posts visible to everyone; category badge, date, summary; click to read.
- **Bilingual (EN / VI)** + **dark/light theme** — persisted, toggles in the top bar.

### Private (invite code)
- **Top Picks** — Qullamaggie setups (VCP & episodic pivots) and momentum leaders, auto-ranked. Curated universe by default; **Broad** toggle adds the full S&P 500 + 400 + 600 (~1500 names).
- **Screener** — type tickers / pick sectors; filter by min score (blank = no limit), signal, stage; sort; transparent status line; click a row for detail.
- **Sectors** — 11 sectors ranked by 3m-vs-6m volume change; expand a row for a weekly/monthly volume-trend chart or screen its stocks.
- **Watchlists** — multiple named lists; per-stock quick-info table (price, score, signal, stage, entry/stop/target, R:R, distance, VCP); click for detail.
- **Stock detail** — candlestick + volume (TradingView lightweight-charts), 6M/1Y/2Y/5Y range, EMA toggles, entry/pivot/stop/target lines; fundamentals trend (Revenue / Net Income / EPS); bilingual bullet-point analysis; add-to-watchlist; TradingView deep-link.
- **Paper trading (multi-account)** — editable accounts with independent capital; manual buys + FIFO partial sells; BUY_STOP / STOP_LOSS / TAKE_PROFIT pending orders; equity curve, risk metrics, average holding period, transaction history, cross-account comparison.
- **Backtest** — replay strategies on historical data, 0-trades-safe.
- **Analysis editor** — write/edit/delete posts in-app; Markdown + YAML front matter; live preview; import/export `.md`.
- **Playbook** — market regime map, reusable prompts (copy buttons), persisted daily routine checklist, risk rules, data sources.
- **Case Studies** — journal of past setups with annotated SVG charts; HTML/print-to-PDF export; syncs via D1.
- **Learn** — quality score explainer, point-in-time screening guide, full glossary (bilingual).
- **Point-in-time ("as of date") screening** — pick a past date; screens, charts, scores, and trade levels recompute as they would have read on that day. Clearly flagged with an amber "Historical mode" badge.

### Mobile
- Hamburger nav with full-screen dropdown, safe-area handling, horizontal-scrolling tables, full-screen stock sheet. `cursor: pointer` on all backdrop dismissals fixes iOS Safari tap handling.

---

## Point-in-time ("as of date") screening

Enabled in Top Picks, Screener, and Sectors via an **As of date** picker + **History depth** selector (2y / 5y / 10y / Max) + **Live** reset. Uses the same scanners — just fetches a longer history then slices to end on the chosen date, so there's no lookahead. Historical scans cache under a date-stamped key and sync across devices.

---

## Deploy as a $0 static site (Cloudflare Pages)

The live site is **the-professional.pages.dev**. Two deployment methods:

### ⚠️ The one rule that matters

Data proxies live in `apps/desktop/functions/`. Cloudflare only picks them up when the **root directory of the build** is `apps/desktop`. After any deploy, verify:

```
https://the-professional.pages.dev/api/yahoo/v8/finance/chart/AAPL?range=1y&interval=1d
```

Must return JSON. A 404 or HTML means the functions didn't deploy — fix the root directory and redeploy.

### Method A — Git auto-deploy

In the Cloudflare dashboard → **the-professional → Settings → Builds & deployments**:

| Setting | Value |
|---|---|
| **Root directory** | `screener-ts/apps/desktop` |
| **Build command** | `cd ../.. && npm install && npm run build --workspace @screener/core && npm run build --workspace @screener/desktop` |
| **Build output directory** | `dist` |
| **Environment variables** | `NODE_VERSION=20`, `VITE_ACCESS_CODES=yourcode` |

### Method B — Direct upload via wrangler

```bash
cd screener-ts
npm install
npm run build --workspace @screener/core
npm run build --workspace @screener/desktop
cd apps/desktop
npx wrangler pages deploy dist --project-name the-professional
```

Set the access code secret:
```bash
npx wrangler pages secret put VITE_ACCESS_CODES --project-name the-professional
```

---

## Cross-device sync (Cloudflare D1)

Watchlists, blog posts, paper-trading accounts, and once-a-day scan results sync across devices via Cloudflare D1. Identity is a simple **access code** — no public sign-up. Rides entirely on the free tier (5 GB, 100k row-writes/day).

### One-time setup

> ⚠️ **Order matters.** Create the database first, then paste its id into `wrangler.toml` before running `d1 execute`.

```bash
cd screener-ts/apps/desktop

# 1. Create the database (prints the database_id)
npx wrangler d1 create screener-sync
# Lost it? Get it anytime:
npx wrangler d1 info screener-sync

# 2. Paste the database_id into wrangler.toml (replace the REPLACE_WITH_DATABASE_ID placeholder)

# 3. Apply the schema (both remote and local)
npx wrangler d1 execute screener-sync --file=./schema.sql --remote
npx wrangler d1 execute screener-sync --file=./schema.sql --local

# 4. Build + deploy
cd ../..
npm run build --workspace @screener/core
npm run build --workspace @screener/desktop
cd apps/desktop
npx wrangler pages deploy dist --project-name the-professional
```

### Issuing sync access codes (separate from the app gate)

Each person needs a row in `users`:

```bash
npx wrangler d1 execute screener-sync --remote --command \
  "INSERT INTO users (id, code, name) VALUES ('me', 'pick-a-long-random-secret', 'Tu Anh');"

# Invited person:
npx wrangler d1 execute screener-sync --remote --command \
  "INSERT INTO users (id, code, name) VALUES ('alice', 'alice-long-secret', 'Alice');"
```

Click the **☁️ cloud button** (top-right of the private app) → paste the sync code → **Save & Sync**. To revoke:

```bash
npx wrangler d1 execute screener-sync --remote --command \
  "DELETE FROM users WHERE code = 'pick-a-long-random-secret';"
```

### Subsequent deploys (every normal code change)

The D1 database persists across deploys — `wrangler pages deploy` only replaces the static site + Functions.

```bash
cd screener-ts
npm run build --workspace @screener/core
npm run build --workspace @screener/desktop
cd apps/desktop
npx wrangler pages deploy dist --project-name the-professional
```

### Troubleshooting

- **`Invalid uuid [code: 7400]`** — `wrangler.toml` still has the placeholder. Run `wrangler d1 info screener-sync`, paste the real id, re-run execute.
- **`no such table: users`** — step 3 was skipped, or only run `--local` when deploying `--remote`. Run both.
- **`401 invalid or missing access code`** — code typed doesn't match any `users.code` row, or schema applied only `--local`. Check with `SELECT id, name FROM users;` (with `--remote`).
- **`503 sync not configured`** — no `DB` binding in `wrangler.toml`, or not deployed from `apps/desktop`.

### Local development

| Command | `/api/sync` reaches | Which D1 |
|---|---|---|
| **`npm run dev:desktop`** | deployed Functions at `the-professional.pages.dev` | **production** — same code you already issued |
| Deployed site / phone | its own Functions | production |
| **`wrangler pages dev dist`** | local Functions runtime | **`--local` D1** — seed separately |

For everyday local work, `npm run dev:desktop` + the same sync code = same data as your phone.

---

## Build the native macOS app (needs Rust + Tauri prereqs)

```bash
cd screener-ts && npm install
npm run build --workspace @screener/core
npm run tauri:dev   --workspace @screener/desktop   # live desktop window
npm run tauri:build --workspace @screener/desktop   # → .app + .dmg in
                                                    #   apps/desktop/src-tauri/target/release/bundle/
```

No proxy in the native shell — Yahoo/Finnhub/Wikipedia called directly through the Rust HTTP layer (`tauri-plugin-http`). Service worker not registered inside Tauri.

> If `cargo` isn't found after installing Rust: `echo '. "$HOME/.cargo/env"' >> ~/.zshrc` and reopen the terminal.

---

## Project layout

```
screener-ts/
├── packages/
│   └── core/              # Pure TypeScript — zero Node/Tauri/React/DOM/fs deps
│       ├── src/
│       │   ├── types/       # OHLCV, Signal, Fundamentals, Account, Position, Order…
│       │   ├── indicators/  # ATR, EMA, volume dry-up, rolling
│       │   ├── qm/          # Qullamaggie scanners: VCP, episodic pivot, trend, quality score
│       │   ├── momentum/    # Momentum engine, market regime, sector rotation, VCP pre-filter
│       │   ├── screener/    # filter/sort, recommend strategies, sector volume
│       │   ├── portfolio/   # paper-trading engine (FIFO, risk, R, drawdown, pending orders)
│       │   ├── analysis/    # bilingual summary + AnalysisProvider interface
│       │   ├── data/        # DataProvider interface + cache + rate limiter
│       │   └── storage/     # Storage interface (+ MemoryStorage)
│       └── tests/         # vitest — 75 tests (QM, momentum, portfolio, summary, infra)
└── apps/
    └── desktop/           # Tauri v2 + Vite web UI; imports @screener/core
        ├── public/         # PWA manifest, service worker, app icons
        ├── src/
        │   ├── adapters/    # YahooProvider, FinnhubProvider, universe (S&P 1500), storage, sync
        │   ├── ui/          # landing (editorial), authGate, publicBlog, charts, stockModal,
        │   │                #   combobox, forms, i18n, theme, glossary, tooltip, syncSettings
        │   ├── tabs/        # picks, screener, sectors, watchlist, portfolio, blog,
        │   │                #   backtest, playbook, casestudies, learn, about
        │   └── blog/        # markdown + front-matter loader / serializer
        ├── posts/           # *.md reports (Analysis: daily / weekly / monthly) — public
        ├── functions/       # Cloudflare Pages proxies (Yahoo crumb, Finnhub key, Wikipedia, sync)
        ├── INSTALL_ON_PHONE.md  # step-by-step PWA install guide (VI)
        ├── vite.config.ts   # dev proxies + core-from-source alias
        └── src-tauri/       # Rust shell (tauri-plugin-http, tauri-plugin-fs)
```

**The contract that makes iOS reuse free later:** all I/O (HTTP, storage, charts) is behind interfaces declared in `core`; concrete implementations live in the app. `core` imports nothing platform-specific.

---

## Run the tests

```bash
cd screener-ts
npm run test:core          # 75 tests: QM + momentum + portfolio + summary + infra
```

---

## Swapping the data provider

`apps/desktop/src/context.ts` chooses `YahooProvider` (default, free) or `FinnhubProvider` from `VITE_DATA_PROVIDER`. Screener and portfolio logic depend only on the `DataProvider` interface. The Finnhub key is read from env/config and hidden behind the Pages function on web.

---

## Known limitations

- **Not a full-market scan.** ~543 curated + ~1500 broad (S&P 500/400/600). Type any ticker into the Screener to analyze it directly.
- **Fundamentals depend on Yahoo's cookie+crumb handshake.** Behind a corporate TLS-inspecting proxy, sector/beta/dividend/company info may stay blank.
- **Broad universe** needs Wikipedia reachable; falls back to the curated ~540 if the fetch fails.
- **In-app composed posts** live in the browser's localStorage (per device). Download the `.md` and add it to `posts/` to publish everywhere.
- **The access gate is client-side.** It's a soft guard for a private circle, not a server-enforced auth layer. Don't store genuinely secret data behind it.
- The **iOS / React Native app is not built** — but `core` has zero UI/platform deps, so adding it means new adapters + UI importing `@screener/core` verbatim.

> Educational use only. Not financial advice.
