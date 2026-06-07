"""Pydantic v2 schemas for pattern detection endpoints."""

from pydantic import BaseModel, Field


class PatternSignalOut(BaseModel):
    symbol: str
    sector: str | None = None
    stage: int = Field(..., description="Weinstein stage 1-4")
    stage_label: str
    score: float = Field(..., ge=0, le=100, description="Conviction score 0-100")
    signal: str = Field(..., description="CONSOLIDATING | BREAKOUT_IMMINENT | NO_SIGNAL")
    entry_price: float | None = None
    stop_loss: float | None = None
    target_price: float | None = None
    risk_reward: float | None = None
    vcp_contractions: int | None = None
    atr_contraction_pct: float | None = None
    price_range_pct: float | None = None
    volume_dry_up_pct: float | None = None
    pivot_high: float | None = None
    days_in_base: int | None = None

    model_config = {"from_attributes": True}


class SectorScanOut(BaseModel):
    sector: str
    total_scanned: int
    qualified: int
    stocks: list[PatternSignalOut]
