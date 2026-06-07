"""
Data fetching abstraction.

Prototype: yfinance
Production: TODO — swap DATA_PROVIDER=finnhub and populate FINNHUB_API_KEY
"""

from __future__ import annotations

import asyncio
import time
from datetime import date, timedelta
from typing import Any, Optional

import pandas as pd
import yfinance as yf

from app.core.config import settings
from app.services.cache import ohlcv_cache

# Simple TTL cache for fundamentals (info dict). Keyed by symbol.
_fundamentals_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _fetch_yfinance(symbol: str, period: str = "1y") -> pd.DataFrame:
    """Download OHLCV data from yfinance (synchronous).

    Returns a DataFrame with columns: open, high, low, close, volume.
    Index is DatetimeIndex (UTC-normalized).
    """
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, auto_adjust=True)
    if df.empty:
        return df
    df.columns = [c.lower() for c in df.columns]
    df.index = pd.DatetimeIndex(df.index).normalize()
    return df[["open", "high", "low", "close", "volume"]].dropna()


async def fetch_ohlcv(symbol: str, period: str = "1y") -> pd.DataFrame:
    """Async OHLCV fetch — runs the blocking call in a thread executor.

    Args:
        symbol: Ticker symbol (e.g. "AAPL").
        period: yfinance period string ("1mo", "3mo", "6mo", "1y", "2y").

    Returns:
        DataFrame with OHLCV columns, DatetimeIndex.
    """
    if settings.data_provider == "finnhub":
        # TODO: implement Finnhub REST client using FINNHUB_API_KEY
        raise NotImplementedError("Finnhub provider not yet implemented")

    # Serve from the in-memory TTL cache when fresh — keeps the personal app
    # snappy and avoids redundant yfinance round-trips.
    cached = await ohlcv_cache.get(symbol, period)
    if cached is not None:
        return cached

    loop = asyncio.get_running_loop()
    df = await loop.run_in_executor(None, _fetch_yfinance, symbol, period)
    if df is not None and not df.empty:
        await ohlcv_cache.set(symbol, period, df)
    return df


async def fetch_multiple(
    symbols: list[str], period: str = "1y", max_concurrent: int = 10
) -> dict[str, pd.DataFrame]:
    """Fetch OHLCV for multiple symbols with bounded concurrency.

    Args:
        symbols: List of ticker symbols.
        period: yfinance period string.
        max_concurrent: Max simultaneous requests.

    Returns:
        Dict mapping symbol -> DataFrame (missing/failed symbols excluded).
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def _limited_fetch(sym: str) -> tuple[str, Optional[pd.DataFrame]]:
        async with semaphore:
            try:
                df = await fetch_ohlcv(sym, period)
                return sym, df if not df.empty else None
            except Exception:
                return sym, None

    results = await asyncio.gather(*[_limited_fetch(s) for s in symbols])
    return {sym: df for sym, df in results if df is not None}


# ── Fundamentals ──────────────────────────────────────────────────────────────

# Fields we surface in the UI, mapped to friendly keys.
_FUNDAMENTAL_FIELDS = {
    "longName": "name",
    "shortName": "short_name",
    "sector": "sector",
    "industry": "industry",
    "marketCap": "market_cap",
    "trailingPE": "pe_ratio",
    "forwardPE": "forward_pe",
    "trailingEps": "eps",
    "forwardEps": "forward_eps",
    "dividendYield": "dividend_yield",
    "beta": "beta",
    "fiftyTwoWeekHigh": "week52_high",
    "fiftyTwoWeekLow": "week52_low",
    "averageVolume": "avg_volume",
    "profitMargins": "profit_margin",
    "revenueGrowth": "revenue_growth",
    "returnOnEquity": "roe",
    "currency": "currency",
    "website": "website",
    "longBusinessSummary": "summary",
    "currentPrice": "current_price",
}


def _fetch_yfinance_info(symbol: str) -> dict[str, Any]:
    """Download the fundamentals/info dict for a symbol (synchronous)."""
    ticker = yf.Ticker(symbol)
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    out: dict[str, Any] = {"symbol": symbol}
    for raw_key, friendly in _FUNDAMENTAL_FIELDS.items():
        out[friendly] = info.get(raw_key)
    # Truncate the business summary to keep payloads light.
    if out.get("summary") and len(out["summary"]) > 600:
        out["summary"] = out["summary"][:600].rsplit(" ", 1)[0] + "…"
    return out


async def fetch_fundamentals(symbol: str) -> dict[str, Any]:
    """Async fundamentals fetch with a TTL cache.

    Returns a dict of friendly-named fundamental fields. Missing values are
    None — the caller/UI handles them gracefully.
    """
    symbol = symbol.upper()
    cached = _fundamentals_cache.get(symbol)
    if cached is not None:
        ts, data = cached
        if time.time() - ts <= settings.cache_ttl_seconds:
            return data

    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, _fetch_yfinance_info, symbol)
    _fundamentals_cache[symbol] = (time.time(), data)
    return data
