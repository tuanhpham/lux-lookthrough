"""
Dynamic stock universe.

The curated SECTOR_STOCKS lists (app.core.constants) are the fast default. For
broader coverage the screener can opt into a much larger universe fetched at
runtime from public constituent lists (S&P 500 / 400 / 600) and cached.

This keeps the personal app zero-config: no API key, falls back gracefully to
the curated lists if the network is unavailable.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import pandas as pd

from app.core.constants import ALL_SECTORS, SECTOR_STOCKS

# Wikipedia constituent tables — broad, free, and reasonably current.
_WIKI_SOURCES = [
    "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies",
    "https://en.wikipedia.org/wiki/List_of_S%26P_600_companies",
]

# Map the GICS sector names Wikipedia uses to our sector keys.
_GICS_ALIASES = {
    "Information Technology": "Technology",
    "Health Care": "Healthcare",
    "Financials": "Financials",
    "Consumer Discretionary": "Consumer Discretionary",
    "Communication Services": "Communication Services",
    "Industrials": "Industrials",
    "Consumer Staples": "Consumer Staples",
    "Energy": "Energy",
    "Utilities": "Utilities",
    "Real Estate": "Real Estate",
    "Materials": "Materials",
}

# Cache the fetched universe for a day — constituents change slowly.
_TTL_SECONDS = 24 * 60 * 60
_cache: dict[str, tuple[float, dict[str, list[str]]]] = {}


def _fetch_wiki_universe() -> dict[str, list[str]]:
    """Scrape constituent tables into a {sector: [symbols]} mapping (sync)."""
    by_sector: dict[str, list[str]] = {s: [] for s in ALL_SECTORS}

    for url in _WIKI_SOURCES:
        try:
            tables = pd.read_html(url)
        except Exception:
            continue
        for table in tables:
            cols = {str(c).strip().lower(): c for c in table.columns}
            sym_col = cols.get("symbol") or cols.get("ticker symbol") or cols.get("ticker")
            sec_col = cols.get("gics sector") or cols.get("sector")
            if sym_col is None or sec_col is None:
                continue
            for _, row in table.iterrows():
                raw_sym = str(row[sym_col]).strip().upper()
                raw_sec = str(row[sec_col]).strip()
                if not raw_sym or raw_sym == "NAN":
                    continue
                # yfinance uses '-' for class shares (BRK.B -> BRK-B).
                symbol = raw_sym.replace(".", "-")
                sector = _GICS_ALIASES.get(raw_sec)
                if sector:
                    by_sector[sector].append(symbol)

    # Merge with curated lists so we never lose a known name, then de-dupe.
    for sector in ALL_SECTORS:
        merged = SECTOR_STOCKS.get(sector, []) + by_sector.get(sector, [])
        by_sector[sector] = list(dict.fromkeys(merged))

    return by_sector


async def get_full_universe() -> dict[str, list[str]]:
    """Return the broad {sector: [symbols]} universe, cached for a day.

    Falls back to the curated SECTOR_STOCKS if the fetch fails or yields nothing.
    """
    cached = _cache.get("full")
    if cached is not None and time.time() - cached[0] <= _TTL_SECONDS:
        return cached[1]

    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(None, _fetch_wiki_universe)
    except Exception:
        result = {}

    # If the scrape produced essentially nothing, fall back to curated lists.
    total = sum(len(v) for v in result.values()) if result else 0
    if total < len(ALL_SECTORS):  # degenerate / failed fetch
        result = {s: list(SECTOR_STOCKS.get(s, [])) for s in ALL_SECTORS}

    _cache["full"] = (time.time(), result)
    return result


async def resolve_sector_symbols(sectors: list[str], broad: bool) -> list[str]:
    """Resolve sector names to constituent symbols (curated or broad universe)."""
    source = await get_full_universe() if broad else SECTOR_STOCKS
    out: list[str] = []
    for sector in sectors:
        for known, stocks in source.items():
            if known.lower() == sector.lower():
                out.extend(stocks)
    return list(dict.fromkeys(out))


def universe_stats() -> dict[str, Any]:
    """Quick counts for surfacing how big each universe is."""
    curated = {s: len(v) for s, v in SECTOR_STOCKS.items()}
    return {
        "curated_total": sum(curated.values()),
        "curated_by_sector": curated,
    }
