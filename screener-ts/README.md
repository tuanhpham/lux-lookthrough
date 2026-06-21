# Screener — TypeScript Monorepo

A single-language TypeScript rewrite of the Python (FastAPI) stock screener.
Runs as a **local web app** (Vite dev server, any OS), ships as a **macOS
desktop app** (Tauri v2 — no Python, no sidecar), deploys as a **$0 static web
app** (Cloudflare Pages), and is an **installable PWA** you can add to your
phone's home screen and use like a native app. All business logic lives in a
platform-agnostic core, so a **future iOS app (React Native) can reuse 100% of
it** and only add UI.

> Educational use only. Not financial advice.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Quick start (run locally, no Rust)](#quick-start--run-it-locally-no-rust-any-os)
3. [Use it on your phone (PWA)](#use-it-on-your-phone-pwa)
4. [How the Conviction Score works](#how-the-conviction-score-works)
5. [Scan coverage — which stocks are scanned?](#scan-coverage--which-stocks-are-scanned)
6. [Why doesn't stock X show up?](#why-doesnt-stock-x-show-up-eg-msft)
7. [Features](#features)
8. [Deploy to Cloudflare Pages](#deploy-as-a-0-static-site-cloudflare-pages)
9. [Build the native macOS app](#build-the-native-macos-app-needs-rust--tauri-prereqs)
10. [Project layout](#project-layout)
11. [Run the tests](#run-the-tests)
12. [Logic parity with the Python reference](#logic-parity-with-the-python-reference)
13. [Swapping the data provider](#swapping-the-data-provider)
14. [Known limitations](#known-limitations)

---

## What it does

A pattern-based US-equity screener in the **VCP / Stage-Analysis** style
(Minervini / Weinstein). For each stock it computes a **0–100 conviction score**,
detects the Weinstein stage and VCP base, derives **entry / stop / target / R:R**,
and explains the read in plain English (EN/VI). It also has paper-trading,
watchlists, sector volume ranking, charts, a trading **Playbook**, and a Markdown
**Analysis** blog.

---

## Quick start — run it locally (no Rust, any OS)

```bash
cd screener-ts
npm install
npm run dev:desktop        # → open http://localhost:1420
```

That's it — **no core build step needed**. `vite.config.ts` aliases
`@screener/core` to its TypeScript source (Vite compiles it on the fly) and runs
dev proxies for `/api/yahoo`, `/api/finnhub`, and `/api/wiki`, so the browser
fetches **live data** with no Cloudflare deploy and no Tauri/Rust.

The landing page loads first; click **Launch the Screener** to enter the app
(Top Picks auto-runs). Paper-trading state and watchlists persist to the
browser's localStorage.

> **Notes**
> - First **Top Picks** / **Sectors** scan fetches the curated universe (~540
>   tickers) and can take a minute; single-stock views are instant. Results cache.
> - The dev proxy applies to `vite dev` only — not `vite preview` of the build.
> - **After changing `packages/core`**, restart dev with `npm run dev:desktop -- --force`
>   and hard-refresh the browser (Cmd/Ctrl+Shift+R) to clear Vite's dep cache.

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node | ≥ 20 | everything |
| Rust + Cargo | stable ([rustup.rs](https://rustup.rs)) | native desktop build only |
| Tauri system deps | [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites) (Xcode CLT on macOS) | native desktop build only |

---

## Use it on your phone (PWA)

The web build is a **Progressive Web App** — deploy it once, then "Add to Home
Screen" on your phone and it runs full-screen like a native app, **free**, no
App Store, no Apple Developer fee, no Rust/Xcode.

1. **Deploy** (see [Cloudflare Pages](#deploy-as-a-0-static-site-cloudflare-pages)):
   ```bash
   cd screener-ts/apps/desktop
   npm run build --workspace @screener/core
   npm run build --workspace @screener/desktop
   npx wrangler pages deploy dist --project-name screener
   ```
2. **Install on the phone**, opening the deployed URL:
   - **iPhone (Safari):** Share → **Add to Home Screen**.
   - **Android (Chrome):** menu → **Install app**.

The layout is mobile-responsive: on a phone the sidebar collapses into a
slide-in **drawer** (tap ☰), content goes full-width, tables scroll
horizontally, and the stock detail becomes a full-screen sheet. iPhone notch /
home-indicator safe areas are respected. The service worker caches the app shell
for instant / offline launch but **never caches `/api/*`**, so stock data stays
live. A full step-by-step guide (in Vietnamese) lives in
[`apps/desktop/INSTALL_ON_PHONE.md`](apps/desktop/INSTALL_ON_PHONE.md).

---

## How the Conviction Score works

Every stock gets a **0–100 conviction score**. It does **not** rate the company
as "good" or "bad" — it measures how tightly the stock is **coiled in a
low-volatility base near a breakout** right now. A high score = a clean technical
setup. The exact rubric (see
[`packages/core/src/scoring/score.ts`](packages/core/src/scoring/score.ts)):

| Component | Points | Meaning |
|---|---|---|
| **Stage** | +25 / +10 / 0 | Stage 2 (advancing) **+25** · Stage 1 (basing) **+10** · otherwise 0 |
| **ATR volatility contraction** | 0 → +20 | The more daily range tightens, the better (maxes out around a 30% contraction). **No lower clamp** — if volatility *expanded*, this term goes **negative**. |
| **Price-range tightness** | 0 → +15 | Tighter base = higher (5% range → +15, 30% → 0). |
| **Volume dry-up** | 0 → +15 | Volume drying up through the base (maxes around 40%). |
| **VCP contractions** | 0 → +15 | +5 per successive (tighter) contraction, capped at 3. |
| **Proximity to pivot** | 0 → +10 | Closer to the breakout pivot = higher (within 5%). |

```
score = Stage + ATR + Range + Volume + VCP + Pivot
score = round(min(score, 100), 1)      # capped at ≤ 100, but NOT clamped at ≥ 0
```

Because the ATR term has **no lower clamp**, a stock whose volatility is
*expanding* can score **negative** (e.g. `STX`, `INTC` at times). That is correct
behavior, not a bug — it just means there's no tight setup there.

This same explainer is shown in-app on the **Learn** tab (bilingual).

---

## Scan coverage — which stocks are scanned?

The app does **not** scan all ~6000+ US-listed tickers. It works on two
universes:

| Mode | Size | Source | When |
|---|---|---|---|
| **Curated** | ~543 names | bundled `SECTOR_STOCKS` | default for Top Picks / Sectors (fast) |
| **Broad** | ~1500 names | S&P 500 + 400 + 600 scraped from Wikipedia | when you enable the **"Broad"** toggle in Top Picks (slower) |

Any ticker **outside** these lists can still be analyzed — just **type it into
the Screener** (e.g. `MSFT, NVDA`) and it will be fetched and scored directly.

---

## Why doesn't stock X show up? (e.g. MSFT)

Almost always one of these — and the app now tells you which:

- **Top Picks uses preset score thresholds:** Breakout needs **score ≥ 70**,
  Momentum **≥ 55**, VCP **≥ 60**. A large-cap that isn't in a tight base right
  now (e.g. **MSFT**) usually scores below the threshold and is filtered out —
  **by design**. Use the **Screener** to see it regardless of score.
- **Screener "Min score" filter:** leave it **blank** for *no* score limit, so
  even negative-scoring names appear. (A blank field = −∞ floor; only a number
  you type becomes a floor.)
- **Couldn't be fetched:** Yahoo rate-limits / network blips cause some symbols
  to be **silently dropped** that run. The Screener status line says
  "N couldn't be fetched … click Run to retry" — just run it again.
- **Too little history:** symbols with **< 60 bars** of data are skipped (the
  pattern engine needs a base to analyze).

The Screener's status line breaks down exactly how many symbols were requested,
fetched, skipped for too little history, and filtered out — so there's never a
silent empty result.

---

## Features

- **Landing page** — logo, hero, feature cards, EN/VI + theme toggles;
  "Launch the Screener" enters the app and auto-runs Top Picks. The sidebar logo
  returns here.
- **Bilingual (EN / VI)** + **dark/light theme** — toggles in the sidebar and on
  the landing; persisted; open views re-render on switch.
- **Mobile-first responsive UI + installable PWA** — off-canvas drawer sidebar,
  full-width content, horizontal-scrolling tables, full-screen stock sheet, and
  iOS safe-area handling. Add to Home Screen for a native-like app.
- **Top Picks** — breakout / momentum / VCP strategies, auto-ranked. Scans the
  curated universe by default; the **broad-universe toggle** pulls the full
  **S&P 500 + 400 + 600 (~1500 names)** from Wikipedia.
- **Screener** — type tickers and/or pick sectors; filter by min score (blank =
  no limit), signal, stage; sort; transparent status line; click a row for detail.
- **Sectors** — 11 sectors ranked by 3m-vs-6m volume change; expand a row for a
  **weekly/monthly volume-trend chart** (compact B/M/K axis) or screen its stocks.
- **Watchlists** — multiple named lists (create / rename / delete via in-app
  dialogs); each shown as a **one-row-per-stock quick-info table** (price, score,
  signal, stage, entry/stop/target, R:R, distance, VCP); click a row for detail.
- **Stock detail** — candlestick + volume (TradingView lightweight-charts),
  6M/1Y/2Y/5Y range, EMA 5/10/21/50/150/200 toggles, entry/pivot/stop/target
  lines; **fundamentals trend** (Revenue / Net Income / EPS, annual ⇄ quarterly,
  reflows on rotate); fundamentals panel with hover-tooltip definitions;
  **bilingual bullet-point Analysis**; add-to-watchlist with list picker;
  **TradingView** deep-link. About + company website fill in from the Yahoo crumb
  fetch when reachable.
- **Paper trading (multi-account)** — independent accounts with **editable name &
  initial capital**, create/delete. Manual buys with a **ticker combobox** and a
  **live latest-close hint**; FIFO partial sells with a **date picker**; optional
  stops (risk excluded until set; editable) and targets, set per ticker; **delete
  any transaction or account** (figures recompute). **BUY_STOP / STOP_LOSS /
  TAKE_PROFIT** pending orders fill on intraday high/low across every missed day;
  insufficient-cash BUY_STOP is rejected with a reason. **Update prices** pulls
  fresh data, fills orders, and snapshots equity. Per-account **equity curve**
  (money-formatted axis), full risk metrics, **average holding period**,
  per-lot-lifecycle **transaction history** (open vs closed rows, buy/sell dates,
  days held, realized PnL), and a **cross-account comparison**.
- **Analysis blog** — renders Markdown from `posts/` with YAML front matter; list
  (newest first, filter by type: daily / weekly / monthly) + reader. Compose
  in-app and **download as `.md`** to drop into `posts/` and redeploy.
- **Playbook** — a trading-system page: market regimes, reusable prompts (with
  copy buttons), a persisted daily routine checklist, risk rules, and data sources.
- **Learn** — the score explainer above + a full glossary of every metric, with
  plain-English definitions (bilingual).
- **AnalysisProvider** — interface only (scaffold) for optional LLM summaries.
  Numbers always come from the DataProvider; the provider only interprets supplied
  data and returns structured `{ summary, strengths, risks }`.

---

## Deploy as a $0 static site (Cloudflare Pages)

```bash
cd screener-ts/apps/desktop
npm run build --workspace @screener/core   # core dist for the production build
npm run build                              # tsc + vite build → dist/
npx wrangler pages deploy dist --project-name screener
npx wrangler pages secret put FINNHUB_API_KEY   # optional fallback provider
```

> Use the **same `--project-name screener`** each time to **update** the existing
> site (your URL stays the same) rather than creating a new project. The first
> `wrangler` run opens a browser to log into Cloudflare (once).

The functions in `functions/` make data fetching work the same as local dev:
- `api/yahoo/*` proxies Yahoo, performing the **cookie + crumb handshake**
  server-side (needed for fundamentals/company profile) and adding CORS.
- `api/finnhub/*` injects `FINNHUB_API_KEY` server-side so it **never reaches
  the browser**.
- `api/wiki/*` proxies Wikipedia for the broad S&P 1500 universe.
- `netlify.toml` documents equivalent Netlify routes.

After redeploying, an installed PWA picks up the new version on its next launch
or two (the service worker revalidates in the background).

---

## Build the native macOS app (needs Rust + Tauri prereqs)

```bash
cd screener-ts && npm install
npm run build --workspace @screener/core            # core dist for the production build
npm run tauri:dev   --workspace @screener/desktop   # live desktop window
npm run tauri:build --workspace @screener/desktop   # → .app + .dmg in
                                                    #   apps/desktop/src-tauri/target/release/bundle/
```

In the native shell there is **no proxy** — Yahoo/Finnhub/Wikipedia are called
directly through the Rust HTTP layer (`tauri-plugin-http`), so no browser CORS.
The service worker is **not** registered inside the Tauri shell.
Add icons first: `cd apps/desktop && npx tauri icon path/to/logo.png`.

> If `cargo` isn't found after installing Rust, add it to your shell:
> `echo '. "$HOME/.cargo/env"' >> ~/.zshrc` and reopen the terminal.

---

## Project layout

```
screener-ts/
├── packages/
│   └── core/              # PURE TypeScript — zero Node/Tauri/React/DOM/fs deps
│       ├── src/
│       │   ├── types/       # OHLCV, Signal, Fundamentals, Account, Position, Order…
│       │   ├── indicators/  # ATR (SMA-of-TR), EMA, volume dry-up, rolling
│       │   ├── patterns/    # Weinstein stage, VCP consolidation, pivot
│       │   ├── scoring/     # 0–100 score, signal rules, trade levels, scanStock
│       │   ├── screener/    # filter/sort, recommend strategies, sector volume
│       │   ├── portfolio/   # paper-trading engine (FIFO, risk, R, drawdown, orders)
│       │   ├── analysis/    # bilingual summary + AnalysisProvider interface
│       │   ├── data/        # DataProvider interface + cache + rate limiter
│       │   └── storage/     # Storage interface (+ MemoryStorage)
│       └── tests/         # vitest — 58 tests (parity, screener, portfolio, summary, infra)
└── apps/
    └── desktop/           # Tauri v2 + Vite web UI; imports @screener/core
        ├── public/         # PWA manifest, service worker, app icons
        ├── src/
        │   ├── adapters/    # YahooProvider, FinnhubProvider, universe (S&P 1500), http, storage
        │   ├── ui/          # charts, stockModal, combobox, forms, i18n, theme, glossary, tooltip
        │   ├── tabs/        # picks, screener, sectors, watchlist, portfolio, blog, playbook, learn
        │   └── blog/        # markdown + front-matter loader / serializer
        ├── posts/           # *.md reports (Analysis: daily / weekly / monthly)
        ├── functions/       # Cloudflare Pages proxies (Yahoo crumb, Finnhub key, Wikipedia)
        ├── INSTALL_ON_PHONE.md  # step-by-step PWA install guide (VI)
        ├── vite.config.ts   # dev proxies + core-from-source alias
        └── src-tauri/       # Rust shell (tauri-plugin-http, tauri-plugin-fs)
```

**The contract that makes iOS free later:** all I/O (HTTP, storage, charts, LLM)
is behind interfaces declared in `core`; concrete implementations live in the
app. `core` imports nothing platform-specific.

---

## Run the tests

```bash
cd screener-ts
npm run test:core          # 58 tests: parity + screener + portfolio + summary + infra
```

Regenerate the golden parity fixtures from the Python reference:

```bash
cd ../backend
PYTHONUTF8=1 PYTHONPATH="$(pwd)" .venv/Scripts/python.exe scripts/gen_golden.py \
  > ../screener-ts/packages/core/tests/fixtures/golden.json
# (generator documented in packages/core/tests/fixtures/README)
```

---

## Logic parity with the Python reference

The pattern engine and scoring are ported **criterion-by-criterion** from the
old Python (`../backend`), preserving exact thresholds, weights, and signal
rules. Parity is **proven by tests**: `tests/fixtures/golden.json` was generated
by running the live Python engine on fixed OHLCV fixtures; the TS engine asserts
against those values to 6 decimals (`tests/parity.test.ts`).

Fidelity points baked in:
- **ATR = simple moving average of True Range** (the pandas fallback the
  reference runs — TA-Lib not installed). Not Wilder's.
- **OHLCV is split/dividend-adjusted uniformly** (`adjClose/rawClose` factor
  applied to O/H/L/C), matching yfinance `auto_adjust=True`.
- **Stage MAs use the simple mean of close**, not the EMA chart overlays.
- **Score has no lower clamp on the ATR term** — a stock whose ATR *expanded*
  can score negative (verified: `downtrend` fixture scores −4.1).
- Python **round-half-to-even** replicated (`util/round.ts`); `scipy.argrelextrema`
  (mode='clip') ported (`util/extrema.ts`) for VCP/pivot detection.

---

## Swapping the data provider

`apps/desktop/src/context.ts` chooses `YahooProvider` (default, free) or
`FinnhubProvider` from config (`VITE_DATA_PROVIDER`). Screener and portfolio
logic depend only on the `DataProvider` interface, so the swap touches no logic.
The Finnhub key is read from env/config — **never hardcoded** — and on web is
hidden behind the Pages function.

---

## Known limitations

- **Not a full-market scan.** The screener works on a curated ~543 list and an
  opt-in broad ~1500 (S&P 500/400/600). Tickers outside both can still be
  analyzed by typing them into the Screener. See
  [Scan coverage](#scan-coverage--which-stocks-are-scanned).
- **Fundamentals depend on Yahoo's cookie+crumb handshake.** ROE / profit margin
  / revenue growth are derived from the auth-free timeseries and always show;
  sector, beta, dividend yield, and the company About/website come from
  `quoteSummary`, which needs the handshake. Behind a corporate TLS-inspecting
  proxy the handshake may fail — those fields then stay blank.
- **Broad universe** needs Wikipedia reachable; it falls back to the curated
  ~540 names if the fetch fails.
- **In-app composed Analysis posts** live in the browser's localStorage (per
  device). To publish them to everyone, download the `.md` and add it to `posts/`,
  then redeploy.
- The **iOS / React Native app is not built** — but `core` has zero UI/platform
  deps, so adding it means new adapters + UI importing `@screener/core` verbatim.

> Educational use only. Not financial advice.
