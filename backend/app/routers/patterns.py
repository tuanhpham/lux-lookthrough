"""Pattern detection endpoints."""

import asyncio

from fastapi import APIRouter, HTTPException

from app.core.constants import ALL_SECTORS, SECTOR_STOCKS
from app.schemas.pattern import PatternSignalOut, SectorScanOut
from app.services.data_fetcher import fetch_multiple, fetch_ohlcv
from app.services.pattern_engine import scan_stock

router = APIRouter()

# Minimum score threshold for sector-wide scan results
SECTOR_SCAN_MIN_SCORE = 55.0


def _result_to_schema(result) -> PatternSignalOut:
    """Convert a PatternResult dataclass to the Pydantic output schema."""
    return PatternSignalOut(
        symbol=result.symbol,
        sector=None,  # populated by callers when available
        stage=result.stage.stage,
        stage_label=result.stage.label,
        score=result.score,
        signal=result.signal,
        entry_price=result.entry_price,
        stop_loss=result.stop_loss,
        target_price=result.target_price,
        risk_reward=result.risk_reward,
        vcp_contractions=result.consolidation.vcp_contractions,
        atr_contraction_pct=result.consolidation.atr_contraction_pct,
        price_range_pct=result.consolidation.price_range_pct,
        volume_dry_up_pct=result.consolidation.volume_dry_up_pct,
        pivot_high=result.pivot.pivot_high,
        days_in_base=result.consolidation.days_in_base,
    )


@router.get("/scan/{symbol}", response_model=PatternSignalOut)
async def scan_symbol(symbol: str, sector: str | None = None) -> PatternSignalOut:
    """Run the full consolidation + pivot scan on a single stock.

    Returns a signal (CONSOLIDATING | BREAKOUT_IMMINENT | NO_SIGNAL),
    a conviction score (0-100), entry, stop-loss, target, and R:R ratio.

    Args:
        symbol: Ticker symbol (e.g. AAPL).
        sector: Optional sector name to attach to the result.
    """
    df = await fetch_ohlcv(symbol.upper(), period="1y")
    if df.empty or len(df) < 60:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient data for symbol '{symbol}'. Minimum 60 trading days required.",
        )

    result = scan_stock(symbol.upper(), df, sector=sector)
    out = _result_to_schema(result)
    out.sector = sector
    return out


@router.get("/scan-sector/{sector}", response_model=SectorScanOut)
async def scan_sector(sector: str, min_score: float = SECTOR_SCAN_MIN_SCORE) -> SectorScanOut:
    """Scan all stocks in a sector and return those with score >= min_score.

    Results are sorted by score descending.

    Args:
        sector: GICS sector name.
        min_score: Minimum conviction score threshold (default 55).
    """
    matched = None
    for s in ALL_SECTORS:
        if s == sector or s.lower() == sector.lower():
            matched = s
            break

    if matched is None:
        raise HTTPException(
            status_code=404,
            detail=f"Sector '{sector}' not found. Valid: {ALL_SECTORS}",
        )

    symbols = SECTOR_STOCKS[matched]
    data = await fetch_multiple(symbols, period="1y", max_concurrent=10)

    qualified: list[PatternSignalOut] = []
    for sym, df in data.items():
        if df is None or len(df) < 60:
            continue
        result = scan_stock(sym, df, sector=matched)
        if result.score >= min_score:
            out = _result_to_schema(result)
            out.sector = matched
            qualified.append(out)

    qualified.sort(key=lambda x: x.score, reverse=True)

    return SectorScanOut(
        sector=matched,
        total_scanned=len(data),
        qualified=len(qualified),
        stocks=qualified,
    )
