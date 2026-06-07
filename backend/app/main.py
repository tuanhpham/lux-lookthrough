"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base
from app.models.watchlist import DEFAULT_WATCHLIST_NAME
from app.routers import industries, patterns, screener, stocks
from app.services.cache import ohlcv_cache

# Import models so their tables are registered on Base.metadata before
# create_all() runs at startup.
from app.models import ohlcv as _ohlcv_model  # noqa: F401
from app.models import signal as _signal_model  # noqa: F401
from app.models import watchlist as _watchlist_model  # noqa: F401


async def _migrate_watchlists(conn) -> None:
    """Idempotent, in-place migration for the personal (SQLite) app.

    Earlier versions stored a single flat watchlist with no concept of named
    collections. This adds the ``watchlist_id`` column if missing and backfills
    any orphaned symbols into a default watchlist so existing users keep theirs.
    Only runs for SQLite; production Postgres uses Alembic.
    """
    if not settings.is_sqlite:
        return

    cols = await conn.exec_driver_sql("PRAGMA table_info(watchlist)")
    col_names = {row[1] for row in cols.fetchall()}
    if not col_names:
        return  # table not created yet; create_all already handled it

    if "watchlist_id" not in col_names:
        await conn.exec_driver_sql(
            "ALTER TABLE watchlist ADD COLUMN watchlist_id INTEGER REFERENCES watchlists(id)"
        )

    # Ensure a default collection exists, then adopt any orphaned items.
    orphans = await conn.exec_driver_sql(
        "SELECT COUNT(*) FROM watchlist WHERE watchlist_id IS NULL"
    )
    has_orphans = (orphans.fetchone() or [0])[0] > 0

    existing = await conn.exec_driver_sql("SELECT id FROM watchlists ORDER BY id LIMIT 1")
    row = existing.fetchone()
    default_id = row[0] if row else None

    if default_id is None and has_orphans:
        await conn.exec_driver_sql(
            "INSERT INTO watchlists (name) VALUES (:name)",
            {"name": DEFAULT_WATCHLIST_NAME},
        )
        again = await conn.exec_driver_sql("SELECT id FROM watchlists ORDER BY id LIMIT 1")
        default_id = (again.fetchone() or [None])[0]

    if default_id is not None and has_orphans:
        await conn.exec_driver_sql(
            "UPDATE watchlist SET watchlist_id = :wid WHERE watchlist_id IS NULL",
            {"wid": default_id},
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Create all DB tables on startup (Alembic handles migrations in prod)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_watchlists(conn)
    yield
    await engine.dispose()


app = FastAPI(
    title="AMR — Stock Analysis API",
    description="Industry Volume Scanner & Consolidation/Pivot Pattern Detector",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(industries.router, prefix="/api/industries", tags=["Industries"])
app.include_router(patterns.router, prefix="/api/patterns", tags=["Patterns"])
app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks"])
app.include_router(screener.router, prefix="/api/screener", tags=["Screener"])


@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/api/cache/stats", tags=["Health"])
async def cache_stats() -> dict:
    """Inspect the in-memory OHLCV cache."""
    return ohlcv_cache.stats()


@app.post("/api/cache/clear", tags=["Health"])
async def cache_clear() -> dict:
    """Clear the in-memory OHLCV cache (forces fresh data on next request)."""
    cleared = await ohlcv_cache.clear()
    return {"cleared_entries": cleared}


# ── Static web dashboard ──────────────────────────────────────────────────────
# Serve a zero-infrastructure single-page dashboard so the app is usable in any
# browser without the Expo/React-Native mobile toolchain.
_WEB_DIR = Path(__file__).resolve().parent / "web"
if _WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_WEB_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    async def dashboard() -> FileResponse:
        return FileResponse(str(_WEB_DIR / "index.html"))
