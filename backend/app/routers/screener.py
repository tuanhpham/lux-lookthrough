"""Custom screener + personal watchlist endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import ALL_SECTORS
from app.core.database import get_db
from app.models.watchlist import WatchlistItem
from app.schemas.screener import (
    ScreenRequest,
    ScreenResponse,
    WatchlistAdd,
    WatchlistOut,
)
from app.services.screener import run_screen

router = APIRouter()


@router.get("/universe", tags=["Screener"])
async def universe() -> dict:
    """Return the available sector universe so the UI can offer presets."""
    return {"sectors": ALL_SECTORS}


@router.post("/screen", response_model=ScreenResponse, tags=["Screener"])
async def screen(req: ScreenRequest) -> ScreenResponse:
    """Run the custom screener over a user-defined universe.

    Provide `symbols`, `sectors`, or both. Apply filters (min_score, signals,
    stages, pivot distance) and a sort order. This is the heart of the
    personal screening app.
    """
    if not req.symbols and not req.sectors:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one of 'symbols' or 'sectors'.",
        )

    result = await run_screen(
        symbols=req.symbols,
        sectors=req.sectors,
        min_score=req.min_score,
        signals=req.signals,
        stages=req.stages,
        max_distance_to_pivot_pct=req.max_distance_to_pivot_pct,
        sort_by=req.sort_by,
        descending=req.descending,
        limit=req.limit,
        period=req.period,
    )
    return ScreenResponse(**result)


# ── Watchlist CRUD ─────────────────────────────────────────────────────────────

@router.get("/watchlist", response_model=list[WatchlistOut], tags=["Watchlist"])
async def list_watchlist(db: AsyncSession = Depends(get_db)) -> list[WatchlistOut]:
    """Return all symbols on the personal watchlist."""
    res = await db.execute(select(WatchlistItem).order_by(WatchlistItem.created_at))
    return [WatchlistOut.model_validate(row) for row in res.scalars().all()]


@router.post("/watchlist", response_model=WatchlistOut, tags=["Watchlist"])
async def add_watchlist(
    payload: WatchlistAdd, db: AsyncSession = Depends(get_db)
) -> WatchlistOut:
    """Add a symbol to the watchlist (idempotent on symbol)."""
    symbol = payload.symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=422, detail="Symbol cannot be empty.")

    existing = await db.execute(
        select(WatchlistItem).where(WatchlistItem.symbol == symbol)
    )
    item = existing.scalar_one_or_none()
    if item:
        item.note = payload.note or item.note
    else:
        item = WatchlistItem(symbol=symbol, note=payload.note)
        db.add(item)
    await db.flush()
    await db.refresh(item)
    return WatchlistOut.model_validate(item)


@router.delete("/watchlist/{symbol}", tags=["Watchlist"])
async def remove_watchlist(symbol: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Remove a symbol from the watchlist."""
    sym = symbol.strip().upper()
    await db.execute(delete(WatchlistItem).where(WatchlistItem.symbol == sym))
    return {"removed": sym}


@router.post("/watchlist/screen", response_model=ScreenResponse, tags=["Watchlist"])
async def screen_watchlist(
    req: ScreenRequest | None = None, db: AsyncSession = Depends(get_db)
) -> ScreenResponse:
    """Run the screener over every symbol currently on the watchlist."""
    res = await db.execute(select(WatchlistItem))
    symbols = [row.symbol for row in res.scalars().all()]
    if not symbols:
        return ScreenResponse(universe=0, scanned=0, matched=0, results=[])

    req = req or ScreenRequest()
    result = await run_screen(
        symbols=symbols,
        min_score=req.min_score,
        signals=req.signals,
        stages=req.stages,
        max_distance_to_pivot_pct=req.max_distance_to_pivot_pct,
        sort_by=req.sort_by,
        descending=req.descending,
        limit=req.limit,
        period=req.period,
    )
    return ScreenResponse(**result)
