"""Integration tests for FastAPI routes using httpx AsyncClient."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="module")
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.mark.anyio
async def test_health(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.anyio
async def test_invalid_sector_returns_404(client: AsyncClient):
    response = await client.get("/api/industries/FakeSector/top-stocks")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_invalid_ohlcv_period_returns_400(client: AsyncClient):
    response = await client.get("/api/stocks/AAPL/ohlcv?period=invalid")
    assert response.status_code == 400
