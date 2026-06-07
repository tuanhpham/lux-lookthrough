"""Industry / sector endpoints."""

from fastapi import APIRouter, HTTPException

from app.core.constants import ALL_SECTORS, SECTOR_STOCKS
from app.schemas.industry import SectorVolumeOut, TopStockOut
from app.services.volume_scanner import compute_sector_volume_rank, get_top_stocks_for_sector

router = APIRouter()


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
    # Normalise: try exact match first, then case-insensitive
    matched = None
    for s in ALL_SECTORS:
        if s == sector or s.lower() == sector.lower():
            matched = s
            break

    if matched is None:
        raise HTTPException(
            status_code=404,
            detail=f"Sector '{sector}' not found. Valid sectors: {ALL_SECTORS}",
        )

    rows = await get_top_stocks_for_sector(matched)
    return [TopStockOut(**r) for r in rows]
