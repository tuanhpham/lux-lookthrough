"""
Industry Volume Scanner.

Computes sector-level volume change by aggregating individual stock
average daily volumes over 3-month vs 6-month windows.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pandas as pd

from app.core.constants import SECTOR_STOCKS
from app.services.data_fetcher import fetch_multiple


async def compute_sector_volume_rank() -> list[dict[str, Any]]:
    """Rank all 11 S&P 500 sectors by volume change (3m vs 6m average).

    Returns:
        List of sector dicts sorted descending by volume_change_pct, with rank.
    """
    all_symbols = [s for stocks in SECTOR_STOCKS.values() for s in stocks]
    symbol_to_sector = {s: sec for sec, stocks in SECTOR_STOCKS.items() for s in stocks}

    # Fetch 6 months of data for all symbols
    data = await fetch_multiple(all_symbols, period="6mo", max_concurrent=12)

    sector_rows: list[dict[str, Any]] = []
    for sector, symbols in SECTOR_STOCKS.items():
        vols_3m: list[float] = []
        vols_6m: list[float] = []

        for sym in symbols:
            df = data.get(sym)
            if df is None or len(df) < 60:
                continue

            n_days = len(df)
            # 3-month ≈ last 63 trading days; 6-month ≈ last 126 trading days
            cutoff_3m = max(0, n_days - 63)
            cutoff_6m = max(0, n_days - 126)

            avg_3m = float(df["volume"].iloc[cutoff_3m:].mean())
            avg_6m = float(df["volume"].iloc[cutoff_6m:].mean())

            if avg_3m > 0 and avg_6m > 0:
                vols_3m.append(avg_3m)
                vols_6m.append(avg_6m)

        if not vols_3m:
            continue

        avg_sector_3m = sum(vols_3m) / len(vols_3m)
        avg_sector_6m = sum(vols_6m) / len(vols_6m)
        change_pct = (avg_sector_3m - avg_sector_6m) / avg_sector_6m * 100

        sector_rows.append({
            "sector": sector,
            "avg_volume_3m": round(avg_sector_3m, 0),
            "avg_volume_6m": round(avg_sector_6m, 0),
            "volume_change_pct": round(change_pct, 2),
        })

    sector_rows.sort(key=lambda x: x["volume_change_pct"], reverse=True)
    for i, row in enumerate(sector_rows, start=1):
        row["rank"] = i

    return sector_rows


async def get_top_stocks_for_sector(
    sector: str, top_n: int = 5
) -> list[dict[str, Any]]:
    """Return top N stocks in a sector ranked by recent volume surge.

    Volume surge = (20-day avg volume) / (3-month avg volume) - 1.

    Args:
        sector: One of the 11 GICS sector names.
        top_n: How many stocks to return.

    Returns:
        List of stock dicts with volume and price change metrics.
    """
    symbols = SECTOR_STOCKS.get(sector, [])
    if not symbols:
        return []

    data = await fetch_multiple(symbols, period="6mo", max_concurrent=10)

    rows: list[dict[str, Any]] = []
    for sym, df in data.items():
        if df is None or len(df) < 63:
            continue

        n = len(df)
        avg_20d = float(df["volume"].iloc[-20:].mean())
        avg_3m = float(df["volume"].iloc[max(0, n - 63):].mean())

        if avg_3m <= 0:
            continue

        surge_pct = (avg_20d - avg_3m) / avg_3m * 100
        price_now = float(df["close"].iloc[-1])
        price_20d_ago = float(df["close"].iloc[-20]) if n >= 20 else price_now
        price_change_pct = (price_now - price_20d_ago) / price_20d_ago * 100

        rows.append({
            "symbol": sym,
            "sector": sector,
            "volume_surge_pct": round(surge_pct, 2),
            "price_change_pct": round(price_change_pct, 2),
            "current_price": round(price_now, 2),
            "avg_volume_20d": round(avg_20d, 0),
            "avg_volume_3m": round(avg_3m, 0),
        })

    rows.sort(key=lambda x: x["volume_surge_pct"], reverse=True)
    return rows[:top_n]
