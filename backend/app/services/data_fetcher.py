"""
Data fetching abstraction.

Prototype: yfinance
Production: TODO — swap DATA_PROVIDER=finnhub and populate FINNHUB_API_KEY
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf

from app.core.config import settings


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

    loop = asyncio.get_running_loop()
    df = await loop.run_in_executor(None, _fetch_yfinance, symbol, period)
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
