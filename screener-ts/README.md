# Screener — TypeScript Monorepo

A single-language TypeScript rewrite of the Python (FastAPI) stock screener.
Ships as a **macOS desktop app** (Tauri v2 — no Python, no PyInstaller, no
sidecar) and as a **$0 static web app** (Cloudflare Pages). All business logic
lives in a platform-agnostic core so a **future iOS app (React Native) reuses
100% of it** and only adds UI.

## Why this shape

```
screener-ts/
├── packages/
│   └── core/            # PURE TypeScript — zero Node/Tauri/React/DOM/fs deps
│       ├── src/
│       │   ├── types/       # OHLCV, Signal, Fundamentals, Account, Position, Order…
│       │   ├── indicators/  # ATR (SMA-of-TR), EMA, volume dry-up, rolling
│       │   ├── patterns/    # Weinstein stage, VCP consolidation, pivot
│       │   ├── scoring/     # 0–100 score, signal rules, trade levels, scanStock
│       │   ├── screener/    # filter/sort, recommend strategies, sector volume
│       │   ├── portfolio/   # paper-trading engine (FIFO, risk, R, drawdown, orders)
│       │   ├── data/        # DataProvider interface + cache + rate limiter
│       │   ├── storage/     # Storage interface (+ MemoryStorage)
│       │   └── analysis/    # AnalysisProvider interface (scaffold only)
│       └── tests/       # vitest — parity + portfolio math (54 tests)
└── apps/
    └── desktop/         # Tauri v2 + Vite web UI; imports @screener/core
        ├── src/
        │   ├── adapters/    # YahooProvider, FinnhubProvider, http, storage
        │   ├── ui/          # dom helpers, charts, results table, stock modal
        │   ├── tabs/        # picks, screener, sectors, watchlist, portfolio, blog, learn
        │   └── blog/        # markdown + front-matter loader
        ├── posts/           # *.md reports (Weekly Analysis)
        ├── functions/       # Cloudflare Pages proxies (Yahoo CORS, Finnhub key-hiding)
        └── src-tauri/       # Rust shell (tauri-plugin-http, tauri-plugin-fs)
```

**The contract that makes iOS free later:** all I/O (HTTP, storage, charts, LLM)
is behind interfaces declared in `core`; concrete implementations live in the
app. `core` imports nothing platform-specific. A React Native app would add new
adapters + UI and import `@screener/core` unchanged.

## Logic parity with the Python reference

The pattern engine and scoring are ported **criterion-by-criterion** from the
old Python (`../backend`), preserving exact thresholds, weights, and signal
rules. Parity is **proven by tests**: `tests/fixtures/golden.json` was generated
by running the live Python engine on fixed OHLCV fixtures; the TS engine is
asserted against those values to 6 decimals (`tests/parity.test.ts`).

Notable fidelity points baked in:
- **ATR = simple moving average of True Range** (the pandas fallback the
  reference actually runs — TA-Lib is not installed there). Not Wilder's.
- **Stage MAs use the simple mean of close**, not the EMA chart overlays.
- **Score has no lower clamp on the ATR term** — a stock whose ATR *expanded*
  can score negative (verified: the `downtrend` fixture scores −4.1).
- Python **round-half-to-even** is replicated (`util/round.ts`) because rounded
  intermediates feed forward.
- `scipy.argrelextrema` (mode='clip') is ported for VCP peak/trough and pivot
  detection (`util/extrema.ts`).

## Prerequisites

| Tool | Version |
|---|---|
| Node | ≥ 20 |
| Rust + Cargo | stable (desktop build only — `https://rustup.rs`) |
| Tauri system deps | per https://tauri.app/start/prerequisites (Xcode CLT on macOS) |

## 1. Run the core tests

```bash
cd screener-ts
npm install
npm run test:core          # 54 tests: parity + screener + portfolio + infra
```

To regenerate the golden parity fixtures from the Python reference:

```bash
cd ../backend
PYTHONUTF8=1 PYTHONPATH="$(pwd)" .venv/Scripts/python.exe scripts/gen_golden.py \
  > ../screener-ts/packages/core/tests/fixtures/golden.json
# (the generator script is reproduced in packages/core/tests/fixtures/README)
```

## 2. Run / deploy — three options

### Option 1 — Web app, locally (easiest, ~30s, no Rust) ✅ recommended first

Shows the full UI with **live stock data**, on any OS (Windows/macOS/Linux):

```bash
cd screener-ts
npm install
npm run build --workspace @screener/core   # build core once (apps import its dist/)
npm run dev:desktop                          # → open http://localhost:1420
```

`vite.config.ts` includes a **dev proxy** that forwards `/api/yahoo/*` and
`/api/finnhub/*` to the real APIs, so the browser fetches live data with **no
Cloudflare deploy and no Tauri/Rust** needed. Click any row in Top Picks or
Screener for charts; Paper Trading persists to your browser's localStorage.

> Note: the first **Top Picks** / **Sectors** scan fetches 100+ tickers from
> Yahoo and can take ~a minute. Single-stock detail views are instant. The proxy
> applies to `vite dev` only — `vite preview` of the built bundle does not proxy
> (use a real deploy for that, Option 3).

### Option 2 — Native macOS desktop app (needs a Mac + Rust)

The real shipping target. Requires macOS, [Rust](https://rustup.rs), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites) (Xcode CLT). In the
native shell there is **no proxy** — Yahoo/Finnhub are called directly through
the Rust HTTP layer (`tauri-plugin-http`), so there is no browser CORS problem.

```bash
cd screener-ts && npm install
npm run build --workspace @screener/core
npm run tauri:dev   --workspace @screener/desktop   # live desktop window
npm run tauri:build --workspace @screener/desktop   # → .app + .dmg in
                                                    #   apps/desktop/src-tauri/target/release/bundle/
```

Add real icons first: `cd apps/desktop && npx tauri icon path/to/logo.png`.

### Option 3 — Static web deploy for $0 (Cloudflare Pages) — best for sharing

The proxy functions in `functions/` are already written, so data fetching works
the same as local dev once deployed.

```bash
cd screener-ts/apps/desktop
npm run build                                  # → dist/
npx wrangler pages deploy dist --project-name screener
# Optional Finnhub fallback — hides the key server-side:
npx wrangler pages secret put FINNHUB_API_KEY
```

You get a `https://screener.pages.dev` URL.

- `functions/api/yahoo/[[path]].ts` proxies Yahoo and adds CORS headers.
- `functions/api/finnhub/[[path]].ts` injects `FINNHUB_API_KEY` server-side so
  it **never reaches the browser**.
- `netlify.toml` documents the equivalent Netlify routes if you prefer Netlify.

## Features

- **Landing page** — hero + feature cards shown first; “Launch the Screener”
  reveals the app and **auto-runs Top Picks**.
- **Bilingual (EN / VI)** — language toggle in the sidebar; persists the choice
  and re-renders open views, including the per-stock analysis narrative.
- **Screener** — Top Picks (breakout / momentum / vcp strategies, **auto-runs on
  entry**, scans the full **546-symbol** curated universe + a broad-universe
  toggle), Custom Screener (symbols + sectors, score/signal/stage filters,
  sorting), Watchlist (persisted), Sectors, Learn (glossary).
- **Stock detail** — candlestick + volume (TradingView lightweight-charts),
  6M/1Y/2Y/5Y range, EMA 5/10/21/50/150/200 toggles, entry/pivot/stop/target
  lines, fundamentals trend + panel, plus a **rule-based bilingual Analysis
  summary** (stage, score, base tightness, VCP, pivot, trade plan).
- **Sectors** — 11 sectors ranked by 3m-vs-6m volume change; click a row to
  expand a **weekly/monthly volume-trend chart** or jump to screening that
  sector's stocks.
- **Paper trading (multi-account)** — independent accounts; manual buys; FIFO
  partial sells; optional stops (risk excluded until set; editable/trailing);
  BUY_STOP / STOP_LOSS / TAKE_PROFIT pending orders filled on intraday high/low
  across every missed day; insufficient-cash BUY_STOP is rejected (not partially
  filled) with a needed-vs-available reason; manual **Update** pulls prices,
  fills orders, and appends an equity snapshot. Equity curve, full account/risk
  metrics, positions with stop reminders, and a **cross-account comparison**.
- **Weekly Analysis blog** — renders Markdown from `posts/` with YAML front
  matter; list (newest first, filter by type) + reader. See
  `posts/2026-06-08-weekly.md` for the report template (sections 1–7).
- **AnalysisProvider** — interface only (scaffold). Numbers always come from the
  DataProvider; the provider only interprets supplied data and returns
  structured `{ summary, strengths, risks }` rendered via fixed templates.

## Swapping the data provider

`apps/desktop/src/context.ts` chooses `YahooProvider` (default) or
`FinnhubProvider` based on config (`VITE_DATA_PROVIDER`). Screener and portfolio
logic depend only on the `DataProvider` interface, so the swap touches no logic.
The Finnhub key is read from env/config — **never hardcoded** — and on web is
hidden behind the Pages function.

## Out of scope (but not blocked)

The iOS / React Native app is not built. Because `core` has zero UI/platform
deps and all I/O is behind interfaces, adding it later means: new adapters
(`DataProvider`/`Storage` via RN libraries) + new UI, importing `@screener/core`
verbatim.

> Educational use only. Not financial advice.
```
