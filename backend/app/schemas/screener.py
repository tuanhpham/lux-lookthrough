"""Pydantic v2 schemas for the custom screener and watchlist."""

from pydantic import BaseModel, Field


class ScreenRequest(BaseModel):
    symbols: list[str] | None = Field(
        default=None, description="Explicit tickers, e.g. ['AAPL','TSLA']"
    )
    sectors: list[str] | None = Field(
        default=None, description="GICS sectors to expand into their constituents"
    )
    min_score: float = Field(default=0.0, ge=0, le=100)
    signals: list[str] | None = Field(
        default=None,
        description="Filter by signal: BREAKOUT_IMMINENT | CONSOLIDATING | NO_SIGNAL",
    )
    stages: list[int] | None = Field(default=None, description="Weinstein stages 1-4")
    max_distance_to_pivot_pct: float | None = None
    sort_by: str = Field(default="score", description="score|distance|range|volume_dryup|symbol")
    descending: bool = True
    limit: int = Field(default=100, ge=1, le=500)
    period: str = Field(default="1y", description="1mo|3mo|6mo|1y|2y")
    broad: bool = Field(
        default=False,
        description="Expand sectors using the broad (S&P 1500+) universe instead of curated lists",
    )


class ScreenRow(BaseModel):
    symbol: str
    stage: int
    stage_label: str
    price: float
    score: float
    signal: str
    entry_price: float | None = None
    stop_loss: float | None = None
    target_price: float | None = None
    risk_reward: float | None = None
    pivot_high: float | None = None
    distance_to_pivot_pct: float | None = None
    price_range_pct: float | None = None
    atr_contraction_pct: float | None = None
    volume_dry_up_pct: float | None = None
    vcp_contractions: int | None = None
    days_in_base: int | None = None


class ScreenResponse(BaseModel):
    universe: int
    scanned: int
    matched: int
    results: list[ScreenRow]


class RecommendResponse(BaseModel):
    strategy: str
    strategy_label: str
    universe: int
    scanned: int
    matched: int
    results: list[ScreenRow]


# ── Watchlist ─────────────────────────────────────────────────────────────────

class WatchlistAdd(BaseModel):
    symbol: str = Field(..., description="Ticker symbol, e.g. AAPL")
    note: str | None = None
    watchlist_id: int | None = Field(
        default=None, description="Target watchlist; defaults to the first list"
    )


class WatchlistItemOut(BaseModel):
    id: int
    symbol: str
    note: str | None = None
    watchlist_id: int | None = None

    model_config = {"from_attributes": True}


# Backwards-compatible alias (older code/tests referenced WatchlistOut).
WatchlistOut = WatchlistItemOut


class WatchlistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80, description="Watchlist name")


class WatchlistRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class WatchlistCollectionOut(BaseModel):
    id: int
    name: str
    count: int = 0
    items: list[WatchlistItemOut] = []

    model_config = {"from_attributes": True}
