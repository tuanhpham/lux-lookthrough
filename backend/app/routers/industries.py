"""Industry / sector endpoints."""

from fastapi import APIRouter, HTTPException

from app.core.constants import ALL_SECTORS, SECTOR_STOCKS
from app.schemas.industry import SectorVolumeOut, SectorVolumeSeriesOut, TopStockOut
from app.services.volume_scanner import (
    compute_sector_volume_rank,
    compute_sector_volume_series,
    get_top_stocks_for_sector,
)

router = APIRouter()


def _match_sector(sector: str) -> str:
    """Resolve a sector name case-insensitively or raise 404."""
    for s in ALL_SECTORS:
        if s == sector or s.lower() == sector.lower():
            return s
    raise HTTPException(
        status_code=404,
        detail=f"Sector '{sector}' not found. Valid sectors: {ALL_SECTORS}",
    )


@router.get("", response_model=list[SectorVolumeOut])
async def list_sectors() -> list[SectorVolumeOut]:
    """Return all 11 S&P 500 sectors ranked by volume change % (3m vs 6m).

    Results are sorted descending — sector[0] has the highest volume surge.
    This call fetches live data from yfinance; expect ~10-15s latency.
    """
    rows = await compute_sector_volume_rank()
    return [SectorVolumeOut(**r) for r in rows]


@router.get("/{sector}/top-stocks", response_model=list[TopStockOut])
async def top_stocks(sector: str) -> list[TopStockOut]:
    """Return the top 5 stocks in the given sector ranked by volume surge.

    Args:
        sector: GICS sector name (case-sensitive, e.g. "Technology").

    Raises:
        404 if the sector name is not recognised.
    """
    matched = _match_sector(sector)
    rows = await get_top_stocks_for_sector(matched)
    return [TopStockOut(**r) for r in rows]


@router.get("/{sector}/volume-series", response_model=SectorVolumeSeriesOut)
async def sector_volume_series(
    sector: str, period: str = "1y", freq: str = "weekly"
) -> SectorVolumeSeriesOut:
    """Aggregated sector volume over time (weekly or monthly buckets).

    Args:
        sector: GICS sector name.
        period: 6mo | 1y | 2y | 5y (yfinance window).
        freq: weekly | monthly.
    """
    valid_periods = {"6mo", "1y", "2y", "5y", "max"}
    if period not in valid_periods:
        raise HTTPException(status_code=400, detail=f"period must be one of {valid_periods}")
    if freq not in {"weekly", "monthly"}:
        raise HTTPException(status_code=400, detail="freq must be 'weekly' or 'monthly'")

    matched = _match_sector(sector)
    result = await compute_sector_volume_series(matched, period=period, freq=freq)
    return SectorVolumeSeriesOut(**result)
