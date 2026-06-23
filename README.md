# Stock Screener

A **Qullamaggie + Momentum** stock screener for US & Vietnam markets.

The entire project lives in **[`screener-ts/`](./screener-ts)** — a TypeScript
monorepo that runs as a local web app, ships as a macOS desktop app (Tauri v2),
deploys as a $0 static site (Cloudflare Pages), and installs as a PWA. All
business logic is in a platform-agnostic core (`packages/core`); the desktop app
(`apps/desktop`) provides the UI and data adapters.

See **[`screener-ts/README.md`](./screener-ts/README.md)** for full docs.

## Quick start

```bash
cd screener-ts
npm install
npm run dev:desktop          # local web app
```

Other commands:

```bash
npm run build --workspace @screener/core      # build the core
npm run test:core                             # run the core test suite
npm run typecheck --workspace @screener/desktop
npm run build  --workspace @screener/desktop  # production web bundle
```

## What it does

- **Top Picks** — Qullamaggie setups (VCP & episodic pivots) and momentum
  leaders, auto-ranked across the universe.
- **Custom Screener** — filter any stocks/sectors by setup type, quality score,
  and momentum.
- **Sectors** — sector rotation ranked by momentum (1M/3M return + RS) with
  volume context.
- **Watchlists, paper trading, interactive charts, and a Learn glossary.**

> Educational use only. Not financial advice.
