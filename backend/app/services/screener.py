"""
Custom Screener.

The "personal app" core: screen ANY list of symbols (your watchlist, a
sector universe, or a hand-typed list) against flexible filters built on top
of the existing pattern engine — no fixed sector universe required.
"""

from __future__ import annotations

from typing import Any, Optional

from app.core.constants import SECTOR_STOCKS
from app.services.data_fetcher import fetch_multiple
from app.services.pattern_engine import scan_stock
from app.services.universe import get_full_universe


def _dedupe(symbols: list[str]) -> list[str]:
    """De-dup while preserving order."""
    seen: set[str] = set()
    out: list[str] = []
    for sym in symbols:
        if sym and sym not in seen:
            seen.add(sym)
            out.append(sym)
    return out


def resolve_universe(
    symbols: Optional[list[str]] = None,
    sectors: Optional[list[str]] = None,
    sector_source: Optional[dict[str, list[str]]] = None,
) -> list[str]:
    """Build a de-duplicated symbol universe from explicit symbols and/or sectors.

    Args:
        symbols: Explicit tickers (uppercased).
        sectors: Sector names to expand into constituents.
        sector_source: Sector→symbols mapping to expand from. Defaults to the
            curated SECTOR_STOCKS; pass the broad universe to widen coverage.
    """
    source = sector_source if sector_source is not None else SECTOR_STOCKS
    universe: list[str] = []
    if symbols:
        universe.extend(s.strip().upper() for s in symbols if s.strip())
    if sectors:
        for sector in sectors:
            for known, stocks in source.items():
                if known.lower() == sector.lower():
                    universe.extend(stocks)
    return _dedupe(universe)


async def run_screen(
    symbols: Optional[list[str]] = None,
    sectors: Optional[list[str]] = None,
    *,
    min_score: float = 0.0,
    signals: Optional[list[str]] = None,
    stages: Optional[list[int]] = None,
    max_distance_to_pivot_pct: Optional[float] = None,
    sort_by: str = "score",
    descending: bool = True,
    limit: int = 100,
    period: str = "1y",
    broad: bool = False,
) -> dict[str, Any]:
    """Screen a custom universe and return ranked matches.

    Args:
        symbols: Explicit ticker list (e.g. ["AAPL", "TSLA"]).
        sectors: Sector names to expand into their constituent symbols.
        min_score: Minimum conviction score (0-100).
        signals: Keep only these signals (e.g. ["BREAKOUT_IMMINENT"]).
        stages: Keep only these Weinstein stages (e.g. [2]).
        max_distance_to_pivot_pct: Keep only setups within this % of pivot.
        sort_by: One of score | distance | range | volume_dryup | symbol.
        descending: Sort direction.
        limit: Max rows returned.
        period: yfinance period for the underlying data.

    Returns:
        Dict with universe size, scanned count, and the ranked result rows.
    """
    sector_source = await get_full_universe() if (broad and sectors) else None
    universe = resolve_universe(symbols, sectors, sector_source)
    if not universe:
        return {"universe": 0, "scanned": 0, "matched": 0, "results": []}

    data = await fetch_multiple(universe, period=period, max_concurrent=16)

    signal_set = {s.upper() for s in signals} if signals else None
    stage_set = set(stages) if stages else None

    rows: list[dict[str, Any]] = []
    for sym, df in data.items():
        if df is None or len(df) < 60:
            continue
        r = scan_stock(sym, df)

        if r.score < min_score:
            continue
        if signal_set is not None and r.signal not in signal_set:
            continue
        if stage_set is not None and r.stage.stage not in stage_set:
            continue
        if (
            max_distance_to_pivot_pct is not None
            and r.pivot.pivot_high is not None
            and r.pivot.distance_to_pivot_pct > max_distance_to_pivot_pct
        ):
            continue

        rows.append({
            "symbol": r.symbol,
            "stage": r.stage.stage,
            "stage_label": r.stage.label,
            "price": r.stage.price,
            "score": r.score,
            "signal": r.signal,
            "entry_price": r.entry_price,
            "stop_loss": r.stop_loss,
            "target_price": r.target_price,
            "risk_reward": r.risk_reward,
            "pivot_high": r.pivot.pivot_high,
            "distance_to_pivot_pct": r.pivot.distance_to_pivot_pct,
            "price_range_pct": r.consolidation.price_range_pct,
            "atr_contraction_pct": r.consolidation.atr_contraction_pct,
            "volume_dry_up_pct": r.consolidation.volume_dry_up_pct,
            "vcp_contractions": r.consolidation.vcp_contractions,
            "days_in_base": r.consolidation.days_in_base,
        })

    sort_keys = {
        "score": lambda x: x["score"],
        "distance": lambda x: x["distance_to_pivot_pct"],
        "range": lambda x: x["price_range_pct"],
        "volume_dryup": lambda x: x["volume_dry_up_pct"],
        "symbol": lambda x: x["symbol"],
    }
    key_fn = sort_keys.get(sort_by, sort_keys["score"])
    # For "distance" ascending is more intuitive (closest to pivot first)
    reverse = descending
    rows.sort(key=key_fn, reverse=reverse)

    return {
        "universe": len(universe),
        "scanned": len(data),
        "matched": len(rows),
        "results": rows[:limit],
    }
