"""Shared test fixtures.

httpx's ASGITransport does not run FastAPI lifespan events, so the schema that
`app.main.lifespan` normally creates at startup is set up here instead. This
keeps tests independent of any pre-existing local SQLite file.
"""

import pytest_asyncio

from app.core.database import Base, engine
from app.main import _migrate_watchlists

# Import models so their tables register on Base.metadata before create_all.
from app.models import ohlcv as _ohlcv  # noqa: F401
from app.models import signal as _signal  # noqa: F401
from app.models import watchlist as _watchlist  # noqa: F401


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _setup_schema():
    """Create all tables (and run the in-place watchlist migration) once."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_watchlists(conn)
    yield
