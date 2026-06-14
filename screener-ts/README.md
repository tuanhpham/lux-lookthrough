# Screener — TypeScript Monorepo

A single-language TypeScript rewrite of the Python (FastAPI) stock screener.
Runs as a **local web app** (Vite dev server, any OS), ships as a **macOS
desktop app** (Tauri v2 — no Python, no sidecar), and deploys as a **$0 static
web app** (Cloudflare Pages). All business logic lives in a platform-agnostic
core, so a **future iOS app (React Native) can reuse 100% of it** and only add UI.

> Educational use only. Not financial advice.

## Layout

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
│       │   ├── portfolio/   # paper-trading engine (FIFO, risk, R, drawdown, orders, delete)
│       │   ├── analysis/    # bilingual summary + AnalysisProvider interface
│       │   ├── data/        # DataProvider interface + cache + rate limiter
│       │   └── storage/     # Storage interface (+ MemoryStorage)
│       └── tests/         # vitest — 58 tests (parity, screener, portfolio, summary, infra)
└── apps/
    └── desktop/           # Tauri v2 + Vite web UI; imports @screener/core
        ├── src/
        │   ├── adapters/    # YahooProvider, FinnhubProvider, universe (S&P 1500), http, storage
        │   ├── ui/          # charts, modal, combobox, forms, i18n, theme, glossary, tooltip
        │   ├── tabs/        # picks, screener, sectors, watchlist, portfolio, blog, learn
        │   └── blog/        # markdown + front-matter loader
        ├── posts/           # *.md reports (Weekly Analysis)
        ├── functions/       # Cloudflare Pages proxies (Yahoo crumb, Finnhub key, Wikipedia)
        ├── vite.config.ts   # dev proxies + core-from-source alias
        └── src-tauri/       # Rust shell (tauri-plugin-http, tauri-plugin-fs)
```

**The contract that makes iOS free later:** all I/O (HTTP, storage, charts, LLM)
is behind interfaces declared in `core`; concrete implementations live in the
app. `core` imports nothing platform-specific.

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
  applied to O/H/L/C), matching yfinance `auto_adjust=True` — so candles are
  consistent and screener inputs match the backend.
- **Stage MAs use the simple mean of close**, not the EMA chart overlays.
- **Score has no lower clamp on the ATR term** — a stock whose ATR *expanded*
  can score negative (verified: `downtrend` fixture scores −4.1).
- Python **round-half-to-even** replicated (`util/round.ts`); `scipy.argrelextrema`
  (mode='clip') ported (`util/extrema.ts`) for VCP/pivot detection.

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node | ≥ 20 | everything |
| Rust + Cargo | stable ([rustup.rs](https://rustup.rs)) | native desktop build only |
| Tauri system deps | [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites) (Xcode CLT on macOS) | native desktop build only |

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
> - First **Top Picks**/**Sectors** scan fetches the curated universe (~540
>   tickers) and can take a minute; single-stock views are instant. Results cache.
> - The dev proxy applies to `vite dev` only — not `vite preview` of the build.
> - **After changing `packages/core`**, restart dev with `npm run dev:desktop -- --force`
>   and hard-refresh the browser (Cmd/Ctrl+Shift+R) to clear Vite's dep cache.

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
Add icons first: `cd apps/desktop && npx tauri icon path/to/logo.png`.

## Deploy as a $0 static site (Cloudflare Pages)

```bash
cd screener-ts/apps/desktop
npm run build              # tsc + vite build → dist/
npx wrangler pages deploy dist --project-name screener
npx wrangler pages secret put FINNHUB_API_KEY   # optional fallback provider
```

The functions in `functions/` make data fetching work the same as local dev:
- `api/yahoo/*` proxies Yahoo, performing the **cookie + crumb handshake**
  server-side (needed for fundamentals/company profile) and adding CORS.
- `api/finnhub/*` injects `FINNHUB_API_KEY` server-side so it **never reaches
  the browser**.
- `api/wiki/*` proxies Wikipedia for the broad S&P 1500 universe.
- `netlify.toml` documents equivalent Netlify routes.

## Features

- **Landing page** — logo, hero, feature cards, EN/VI + theme toggles;
  “Launch the Screener” enters the app and auto-runs Top Picks. The sidebar logo
  returns here.
- **Bilingual (EN / VI)** + **dark/light theme** — toggles in the sidebar and on
  the landing; persisted; open views re-render on switch.
- **Top Picks** — breakout / momentum / VCP strategies, auto-ranked. Scans the
  curated universe by default; the **broad-universe toggle** pulls the full
  **S&P 500 + 400 + 600 (~1500 names)** from Wikipedia.
- **Screener** — type tickers and/or pick sectors; filter by min score, signal,
  stage; sort; click any row for the stock detail.
- **Sectors** — 11 sectors ranked by 3m-vs-6m volume change; expand a row for a
  **weekly/monthly volume-trend chart** (compact B/M/K axis) or screen its stocks.
- **Watchlists** — multiple named lists (create / rename / delete via in-app
  dialogs); each shown as a **one-row-per-stock quick-info table** (price, score,
  signal, stage, entry/stop/target, R:R, distance, VCP); click a row for detail.
- **Stock detail** — candlestick + volume (TradingView lightweight-charts),
  6M/1Y/2Y/5Y range, EMA 5/10/21/50/150/200 toggles, entry/pivot/stop/target
  lines; **fundamentals trend** (Revenue / Net Income / EPS, annual ⇄ quarterly);
  fundamentals panel with hover-tooltip definitions; **bilingual bullet-point
  Analysis**; add-to-watchlist with list picker; **TradingView** deep-link. About
  + company website fill in from the Yahoo crumb fetch when reachable.
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
  days held, realized PnL), and a **cross-account comparison** (click a row to
  jump to that account).
- **Weekly Analysis blog** — renders Markdown from `posts/` with YAML front
  matter; list (newest first, filter by type) + reader. See
  `posts/2026-06-08-weekly.md` for the report template (sections 1–7).
- **AnalysisProvider** — interface only (scaffold) for optional LLM summaries.
  Numbers always come from the DataProvider; the provider only interprets
  supplied data and returns structured `{ summary, strengths, risks }`.

## Swapping the data provider

`apps/desktop/src/context.ts` chooses `YahooProvider` (default, free) or
`FinnhubProvider` from config (`VITE_DATA_PROVIDER`). Screener and portfolio
logic depend only on the `DataProvider` interface, so the swap touches no logic.
The Finnhub key is read from env/config — **never hardcoded** — and on web is
hidden behind the Pages function.

## Known limitations

- **Fundamentals depend on Yahoo's cookie+crumb handshake.** ROE / profit margin
  / revenue growth are derived from the auth-free timeseries and always show;
  sector, beta, dividend yield, and the company About/website come from
  `quoteSummary`, which needs the handshake. Behind a corporate TLS-inspecting
  proxy the handshake may fail — those fields then stay blank. Done in the Rust
  layer (desktop) and the Cloudflare function (web), which use the system CA store.
- **Broad universe** needs Wikipedia reachable; it falls back to the curated
  ~540 names if the fetch fails.
- The **iOS / React Native app is not built** — but `core` has zero UI/platform
  deps, so adding it means new adapters + UI importing `@screener/core` verbatim.

> Educational use only. Not financial advice.
