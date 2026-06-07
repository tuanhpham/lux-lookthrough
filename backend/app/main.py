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
from app.routers import industries, patterns, screener, stocks
from app.services.cache import ohlcv_cache

# Import models so their tables are registered on Base.metadata before
# create_all() runs at startup.
from app.models import ohlcv as _ohlcv_model  # noqa: F401
from app.models import signal as _signal_model  # noqa: F401
from app.models import watchlist as _watchlist_model  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Create all DB tables on startup (Alembic handles migrations in prod)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
