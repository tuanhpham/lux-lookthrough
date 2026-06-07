"""Custom screener + personal watchlist endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.constants import ALL_SECTORS
from app.core.database import get_db
from app.models.watchlist import (
    DEFAULT_WATCHLIST_NAME,
    Watchlist,
    WatchlistItem,
)
from app.schemas.screener import (
    ScreenRequest,
    ScreenResponse,
    WatchlistAdd,
    WatchlistCollectionOut,
    WatchlistCreate,
    WatchlistItemOut,
    WatchlistRename,
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


# ── Watchlist collection helpers ───────────────────────────────────────────────

async def _get_or_create_default(db: AsyncSession) -> Watchlist:
    """Return the user's default watchlist, creating it if none exist yet."""
    res = await db.execute(select(Watchlist).order_by(Watchlist.id).limit(1))
    wl = res.scalar_one_or_none()
    if wl is None:
        wl = Watchlist(name=DEFAULT_WATCHLIST_NAME)
        db.add(wl)
        await db.flush()
        await db.refresh(wl)
    return wl


async def _resolve_watchlist(db: AsyncSession, watchlist_id: int | None) -> Watchlist:
    """Resolve an explicit watchlist id, or fall back to the default list."""
    if watchlist_id is None:
        return await _get_or_create_default(db)
    res = await db.execute(select(Watchlist).where(Watchlist.id == watchlist_id))
    wl = res.scalar_one_or_none()
    if wl is None:
        raise HTTPException(status_code=404, detail="Watchlist not found.")
    return wl


# ── Named watchlist collections (CRUD) ──────────────────────────────────────────

@router.get("/watchlists", response_model=list[WatchlistCollectionOut], tags=["Watchlist"])
async def list_watchlists(db: AsyncSession = Depends(get_db)) -> list[WatchlistCollectionOut]:
    """Return every named watchlist with its symbols."""
    await _get_or_create_default(db)
    res = await db.execute(
        select(Watchlist).options(selectinload(Watchlist.items)).order_by(Watchlist.id)
    )
    out: list[WatchlistCollectionOut] = []
    for wl in res.scalars().all():
        out.append(
            WatchlistCollectionOut(
                id=wl.id,
                name=wl.name,
                count=len(wl.items),
                items=[WatchlistItemOut.model_validate(i) for i in wl.items],
            )
        )
    return out


@router.post("/watchlists", response_model=WatchlistCollectionOut, tags=["Watchlist"])
async def create_watchlist(
    payload: WatchlistCreate, db: AsyncSession = Depends(get_db)
) -> WatchlistCollectionOut:
    """Create a new named watchlist."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty.")
    existing = await db.execute(select(Watchlist).where(Watchlist.name == name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A watchlist with that name already exists.")
    wl = Watchlist(name=name)
    db.add(wl)
    await db.flush()
    await db.refresh(wl)
    return WatchlistCollectionOut(id=wl.id, name=wl.name, count=0, items=[])


@router.patch("/watchlists/{watchlist_id}", response_model=WatchlistCollectionOut, tags=["Watchlist"])
async def rename_watchlist(
    watchlist_id: int, payload: WatchlistRename, db: AsyncSession = Depends(get_db)
) -> WatchlistCollectionOut:
    """Rename a watchlist."""
    wl = await _resolve_watchlist(db, watchlist_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty.")
    clash = await db.execute(
        select(Watchlist).where(Watchlist.name == name, Watchlist.id != watchlist_id)
    )
    if clash.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A watchlist with that name already exists.")
    wl.name = name
    await db.flush()
    count = await db.scalar(
        select(func.count()).select_from(WatchlistItem).where(WatchlistItem.watchlist_id == wl.id)
    )
    return WatchlistCollectionOut(id=wl.id, name=wl.name, count=count or 0, items=[])


@router.delete("/watchlists/{watchlist_id}", tags=["Watchlist"])
async def delete_watchlist(watchlist_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """Delete a watchlist and all its symbols."""
    wl = await _resolve_watchlist(db, watchlist_id)
    await db.delete(wl)
    await db.flush()
    # Guarantee at least one list always exists for a clean UX.
    await _get_or_create_default(db)
    return {"deleted": watchlist_id}


@router.post(
    "/watchlists/{watchlist_id}/screen",
    response_model=ScreenResponse,
    tags=["Watchlist"],
)
async def screen_named_watchlist(
    watchlist_id: int,
    req: ScreenRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> ScreenResponse:
    """Run the screener over every symbol on a specific watchlist."""
    wl = await _resolve_watchlist(db, watchlist_id)
    res = await db.execute(
        select(WatchlistItem).where(WatchlistItem.watchlist_id == wl.id)
    )
    symbols = [row.symbol for row in res.scalars().all()]
    if not symbols:
        return ScreenResponse(universe=0, scanned=0, matched=0, results=[])
    return await _screen_symbols(symbols, req)


# ── Watchlist items (single-list, backwards compatible) ──────────────────────────

@router.get("/watchlist", response_model=list[WatchlistItemOut], tags=["Watchlist"])
async def list_watchlist(
    watchlist_id: int | None = None, db: AsyncSession = Depends(get_db)
) -> list[WatchlistItemOut]:
    """Return symbols on a watchlist (defaults to the first list)."""
    wl = await _resolve_watchlist(db, watchlist_id)
    res = await db.execute(
        select(WatchlistItem)
        .where(WatchlistItem.watchlist_id == wl.id)
        .order_by(WatchlistItem.created_at)
    )
    return [WatchlistItemOut.model_validate(row) for row in res.scalars().all()]


@router.post("/watchlist", response_model=WatchlistItemOut, tags=["Watchlist"])
async def add_watchlist(
    payload: WatchlistAdd, db: AsyncSession = Depends(get_db)
) -> WatchlistItemOut:
    """Add a symbol to a watchlist (idempotent per list)."""
    symbol = payload.symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=422, detail="Symbol cannot be empty.")
    wl = await _resolve_watchlist(db, payload.watchlist_id)

    existing = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.watchlist_id == wl.id, WatchlistItem.symbol == symbol
        )
    )
    item = existing.scalar_one_or_none()
    if item:
        item.note = payload.note or item.note
    else:
        item = WatchlistItem(symbol=symbol, note=payload.note, watchlist_id=wl.id)
        db.add(item)
    await db.flush()
    await db.refresh(item)
    return WatchlistItemOut.model_validate(item)


@router.delete("/watchlist/{symbol}", tags=["Watchlist"])
async def remove_watchlist(
    symbol: str, watchlist_id: int | None = None, db: AsyncSession = Depends(get_db)
) -> dict:
    """Remove a symbol from a watchlist (defaults to the first list)."""
    sym = symbol.strip().upper()
    wl = await _resolve_watchlist(db, watchlist_id)
    await db.execute(
        delete(WatchlistItem).where(
            WatchlistItem.watchlist_id == wl.id, WatchlistItem.symbol == sym
        )
    )
    return {"removed": sym, "watchlist_id": wl.id}


@router.post("/watchlist/screen", response_model=ScreenResponse, tags=["Watchlist"])
async def screen_watchlist(
    req: ScreenRequest | None = None,
    watchlist_id: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> ScreenResponse:
    """Run the screener over a watchlist (defaults to the first list)."""
    wl = await _resolve_watchlist(db, watchlist_id)
    res = await db.execute(
        select(WatchlistItem).where(WatchlistItem.watchlist_id == wl.id)
    )
    symbols = [row.symbol for row in res.scalars().all()]
    if not symbols:
        return ScreenResponse(universe=0, scanned=0, matched=0, results=[])
    return await _screen_symbols(symbols, req)


async def _screen_symbols(
    symbols: list[str], req: ScreenRequest | None
) -> ScreenResponse:
    """Shared helper: screen an explicit symbol list with request filters."""
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
