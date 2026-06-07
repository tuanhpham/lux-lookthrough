# AMR — Personal Stock Screener

Industry Volume Scanner + Consolidation/Pivot Pattern Detector for US markets (NYSE, NASDAQ).

> **Use it as a personal app in 30 seconds — no Postgres, Redis, Celery, or phone required.**
> A built-in web dashboard + a zero-config SQLite backend let you screen any stocks
> right from your browser.

---

## 🚀 Personal App Quick Start (zero infrastructure)

No database server, no Redis, no Expo. Just Python:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Then open **http://localhost:8000** in your browser. That's it.

- It uses a local **SQLite** file (`amr_personal.db`) created automatically — no DB setup.
- TA-Lib is **optional** (there's a pure-pandas ATR fallback).
- yfinance results are cached in-memory (15 min TTL) so repeat scans are instant.

### What you get in the browser

| Tab | What it does |
|-----|--------------|
| **Screener** | Type any tickers (`AAPL, MSFT, NVDA`) or pick whole sectors, then filter by min score, signal, stage, and sort. |
| **Watchlist** | Save your favorite symbols (persisted in SQLite) and screen them all in one click. |
| **Sectors** | Rank all 11 S&P 500 sectors by volume change (3m vs 6m). |

### New personal-app API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/screener/screen` | Screen a custom universe (symbols and/or sectors) with filters |
| GET | `/api/screener/universe` | Available sector presets |
| GET/POST/DELETE | `/api/screener/watchlist` | Manage your personal watchlist |
| POST | `/api/screener/watchlist/screen` | Run the screener over your whole watchlist |
| GET | `/api/cache/stats` · POST `/api/cache/clear` | Inspect / reset the OHLCV cache |

Example screen request:

```bash
curl -X POST http://localhost:8000/api/screener/screen \
  -H "Content-Type: application/json" \
  -d '{"sectors":["Technology"],"min_score":40,"signals":["BREAKOUT_IMMINENT"],"sort_by":"score"}'
```

> The Postgres + Redis + Celery + React Native stack described below is still
> fully supported for a production deployment. The personal mode above is just
> a lighter on-ramp.

---

## Architecture

```
AMR/
├── backend/                  # FastAPI + Celery
│   ├── app/
│   │   ├── core/             # config, database, constants
│   │   ├── models/           # SQLAlchemy ORM (OHLCV, Signal)
│   │   ├── schemas/          # Pydantic v2 response models
│   │   ├── routers/          # industries, patterns, stocks
│   │   ├── services/         # pattern_engine, volume_scanner, data_fetcher
│   │   └── tasks/            # Celery app + nightly_scan task
│   ├── alembic/              # DB migrations
│   └── tests/
└── mobile/                   # React Native / Expo
    └── src/
        ├── api/              # axios API clients
        ├── navigation/       # bottom tab + stack navigators
        ├── screens/          # HomeScreen, SectorScreen, PatternScreen, StockDetailScreen
        ├── components/       # ScoreBar, SignalBadge, StatRow, etc.
        ├── store/            # Zustand global state
        └── types/            # shared TypeScript interfaces
```

---

## Prerequisites

| Tool | Version | You have it? |
|------|---------|-------------|
| Python | ≥ 3.12 | ✅ 3.14 |
| Node.js | ≥ 20 | ✅ 24 |
| PostgreSQL | ≥ 15 | ❌ install below |
| Redis | ≥ 7 | ❌ install below |
| Docker Desktop | ≥ 24 | optional (alternative to native installs) |
| Expo CLI | latest | run `npm i -g expo-cli` |

---

## Option A — Run Fully Locally (Windows, no Docker)

### A1. Install PostgreSQL 16

1. Download the installer: **https://www.enterprisedb.com/downloads/postgres-postgresql-downloads**  
   Choose **Windows x86-64, version 16.x**.
2. Run the installer. When prompted:
   - Password for `postgres` superuser: anything you like (e.g. `postgres`)
   - Port: **5432** (default)
   - Locale: default
3. Finish the install. **Uncheck** "Stack Builder" at the end — you don't need it.
4. Open **pgAdmin** (installed alongside) or a new PowerShell and create the app database:

```powershell
# In PowerShell — adjust path if your Postgres version differs
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE USER amr WITH PASSWORD 'amrpassword';"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE amr_db OWNER amr;"
```

Add Postgres to your PATH permanently (run once in PowerShell as Administrator):

```powershell
[Environment]::SetEnvironmentVariable(
  "PATH",
  $env:PATH + ";C:\Program Files\PostgreSQL\16\bin",
  "Machine"
)
```

Then open a **new** terminal and confirm: `psql --version`

> **TimescaleDB (optional for local dev):** The app works fine with plain PostgreSQL locally.  
> TimescaleDB only matters in production for query performance on millions of rows.  
> Skip it for now and install it later via the TimescaleDB Windows installer at https://docs.timescale.com/self-hosted/latest/install/installation-windows/

### A2. Install Redis on Windows

Redis doesn't have an official Windows build, but there are two easy options:

**Option 1 — Memurai (Redis-compatible, native Windows, free for dev):**
1. Download from **https://www.memurai.com/get-memurai**
2. Run the `.msi` installer — it installs as a Windows Service on port 6379 automatically.
3. Confirm: open a new PowerShell and run `memurai-cli ping` → should print `PONG`.

**Option 2 — Redis via WSL 2 (if you have WSL installed):**
```powershell
wsl --install          # skip if WSL already installed, then reboot
# After reboot, open Ubuntu from Start menu:
sudo apt update && sudo apt install redis-server -y
sudo service redis-server start
redis-cli ping         # should print PONG
```

### A3. Create and activate a Python virtual environment

Open PowerShell in the `AMR` folder:

```powershell
cd C:\Users\PHAMT\Downloads\github\AMR\backend

python -m venv .venv
.venv\Scripts\Activate.ps1
```

If you get a scripts execution policy error, run this first:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### A4. Install TA-Lib (Windows pre-built wheel)

TA-Lib requires a C extension. On Windows, use the pre-built wheel:

```powershell
# With your venv active:
pip install --find-links https://github.com/cgohlke/talib-build/releases/latest TA-Lib
```

If that URL doesn't resolve, go to **https://github.com/cgohlke/talib-build/releases**,  
download the `.whl` file matching `cp314-cp314-win_amd64`, then:

```powershell
pip install path\to\TA_Lib-0.4.x-cp314-cp314-win_amd64.whl
```

Then uncomment the `TA-Lib` line in `requirements.txt`:

```
# before:
# TA-Lib>=0.4.29

# after:
TA-Lib>=0.4.29
```

### A5. Install Python dependencies

```powershell
pip install -r requirements.txt
```

### A6. Set up the database schema

```powershell
# Still inside backend/ with venv active
alembic upgrade head
```

### A7. Start the API server

```powershell
uvicorn app.main:app --reload --port 8000
```

API docs live at: **http://localhost:8000/docs**

### A8. Start Celery worker (new terminal)

```powershell
cd C:\Users\PHAMT\Downloads\github\AMR\backend
.venv\Scripts\Activate.ps1
celery -A app.tasks.celery_app worker --loglevel=info -Q default,scans --pool=solo
```

> `--pool=solo` is required on Windows — the default `prefork` pool doesn't work on Windows.

### A9. Start Celery beat scheduler (new terminal)

```powershell
cd C:\Users\PHAMT\Downloads\github\AMR\backend
.venv\Scripts\Activate.ps1
celery -A app.tasks.celery_app beat --loglevel=info
```

The nightly scan runs automatically at **6:00 PM ET, Mon–Fri**.  
To trigger it manually from a Python shell:

```python
from app.tasks.nightly_scan import run_nightly_scan
run_nightly_scan.delay()
```

### A10. Mobile app

```powershell
cd C:\Users\PHAMT\Downloads\github\AMR\mobile
copy .env.example .env
# EXPO_PUBLIC_API_URL=http://localhost:8000  (already set)

npm install
npx expo start
```

Scan the QR code with Expo Go on your phone, or press `w` for browser preview.

---

## Option B — Docker Compose (requires Docker Desktop)

Install Docker Desktop from **https://www.docker.com/products/docker-desktop/**, then:

```powershell
cd C:\Users\PHAMT\Downloads\github\AMR
copy .env.example .env
# Change localhost → db and redis in DATABASE_URL / REDIS_URL for Docker networking

docker compose up --build
```

---

## Quick Start (TL;DR — local, no Docker)

```powershell
# 1. Install PostgreSQL 16 + Memurai (Redis) — see A1/A2 above
# 2. Create DB user and database — see A1 above

cd C:\Users\PHAMT\Downloads\github\AMR\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
# Open http://localhost:8000/docs
```

---

## Running tests

```bash
cd backend
pytest -v
```

---

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/industries` | All 11 sectors ranked by volume change % |
| GET | `/api/industries/{sector}/top-stocks` | Top 5 stocks in sector by volume surge |
| GET | `/api/patterns/scan/{symbol}` | Full pattern scan for one symbol |
| GET | `/api/patterns/scan-sector/{sector}` | All qualifying setups in a sector |
| GET | `/api/stocks/{symbol}/ohlcv` | OHLCV data for charting |
| GET | `/health` | Liveness probe |

---

## Pattern Scoring (0–100)

| Criterion | Max pts |
|-----------|---------|
| Stage 2 (Weinstein advancing) | 25 |
| ATR contraction ≥ 30% | 20 |
| Price range < 5% | 15 |
| Volume dry-up ≥ 40% | 15 |
| VCP contractions (3+) | 15 |
| Pivot proximity < 1% | 10 |

Signals: **BREAKOUT_IMMINENT** (score ≥ 70, within 3% of pivot) · **CONSOLIDATING** (score ≥ 40) · **NO_SIGNAL**

---

## Upgrading to Finnhub (Production)

1. Get an API key at https://finnhub.io
2. Set `FINNHUB_API_KEY=your_key` and `DATA_PROVIDER=finnhub` in `.env`
3. Implement `_fetch_finnhub()` in `backend/app/services/data_fetcher.py`  
   (the `TODO` comment marks exactly where to add it)

---

## TimescaleDB Hypertable (Production)

After running `alembic upgrade head`, convert the OHLCV table to a hypertable for efficient time-series queries:

```sql
SELECT create_hypertable('ohlcv', 'date', if_not_exists => TRUE);
```

---

## Environment Variables Reference

See `.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Async PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `FINNHUB_API_KEY` | Finnhub API key (production) |
| `DATA_PROVIDER` | `yfinance` (default) or `finnhub` |
| `ALLOWED_ORIGINS` | CORS origins for the mobile app |
| `EXPO_PUBLIC_API_URL` | Backend URL visible to the Expo app |
