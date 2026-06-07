"""Tests for the custom screener + watchlist (no network calls required)."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.screener import resolve_universe


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="module")
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ── Universe resolution (pure function, no I/O) ───────────────────────────────

class TestResolveUniverse:
    def test_explicit_symbols_are_uppercased_and_deduped(self):
        u = resolve_universe(symbols=["aapl", "AAPL", "msft"])
        assert u == ["AAPL", "MSFT"]

    def test_sector_expands_to_constituents(self):
        u = resolve_universe(sectors=["Technology"])
        assert "AAPL" in u and "NVDA" in u
        assert len(u) >= 10

    def test_sector_is_case_insensitive(self):
        u = resolve_universe(sectors=["technology"])
        assert "AAPL" in u

    def test_symbols_and_sectors_combine_without_dupes(self):
        u = resolve_universe(symbols=["AAPL"], sectors=["Technology"])
        assert u.count("AAPL") == 1

    def test_empty_returns_empty(self):
        assert resolve_universe() == []


# ── API surface ───────────────────────────────────────────────────────────────

class TestScreenerApi:
    @pytest.mark.anyio
    async def test_universe_endpoint(self, client: AsyncClient):
        r = await client.get("/api/screener/universe")
        assert r.status_code == 200
        assert "Technology" in r.json()["sectors"]

    @pytest.mark.anyio
    async def test_screen_requires_input(self, client: AsyncClient):
        r = await client.post("/api/screener/screen", json={})
        assert r.status_code == 422

    @pytest.mark.anyio
    async def test_cache_stats(self, client: AsyncClient):
        r = await client.get("/api/cache/stats")
        assert r.status_code == 200
        assert "ttl_seconds" in r.json()


class TestWatchlistApi:
    @pytest.mark.anyio
    async def test_add_list_delete_cycle(self, client: AsyncClient):
        # add
        r = await client.post("/api/screener/watchlist", json={"symbol": "tsla"})
        assert r.status_code == 200
        assert r.json()["symbol"] == "TSLA"

        # adding again is idempotent (still one TSLA)
        await client.post("/api/screener/watchlist", json={"symbol": "TSLA"})
        listing = await client.get("/api/screener/watchlist")
        symbols = [i["symbol"] for i in listing.json()]
        assert symbols.count("TSLA") == 1

        # delete
        d = await client.delete("/api/screener/watchlist/TSLA")
        assert d.status_code == 200
        assert d.json()["removed"] == "TSLA"

    @pytest.mark.anyio
    async def test_empty_symbol_rejected(self, client: AsyncClient):
        r = await client.post("/api/screener/watchlist", json={"symbol": "  "})
        assert r.status_code == 422
