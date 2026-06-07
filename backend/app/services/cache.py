"""
Lightweight in-memory TTL cache for OHLCV DataFrames.

Personal-use friendly: avoids hammering yfinance on every request without
requiring Redis. Thread/async-safe via a simple asyncio lock. Falls back
gracefully — if anything goes wrong it just skips caching.
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional

import pandas as pd

from app.core.config import settings


class _TTLCache:
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = ttl_seconds
        self._store: dict[str, tuple[float, pd.DataFrame]] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _key(symbol: str, period: str) -> str:
        return f"{symbol.upper()}::{period}"

    async def get(self, symbol: str, period: str) -> Optional[pd.DataFrame]:
        key = self._key(symbol, period)
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            ts, df = entry
            if time.time() - ts > self._ttl:
                # expired
                self._store.pop(key, None)
                return None
            return df.copy()

    async def set(self, symbol: str, period: str, df: pd.DataFrame) -> None:
        key = self._key(symbol, period)
        async with self._lock:
            self._store[key] = (time.time(), df.copy())

    async def clear(self) -> int:
        async with self._lock:
            n = len(self._store)
            self._store.clear()
            return n

    def stats(self) -> dict:
        now = time.time()
        live = sum(1 for ts, _ in self._store.values() if now - ts <= self._ttl)
        return {
            "entries": len(self._store),
            "live_entries": live,
            "ttl_seconds": self._ttl,
        }


ohlcv_cache = _TTLCache(settings.cache_ttl_seconds)
