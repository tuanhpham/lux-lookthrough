"""Pydantic v2 schemas for industry / sector endpoints."""

from pydantic import BaseModel, Field


class SectorVolumeOut(BaseModel):
    sector: str
    avg_volume_3m: float = Field(..., description="Average daily volume over past 3 months")
    avg_volume_6m: float = Field(..., description="Average daily volume over past 6 months")
    volume_change_pct: float = Field(..., description="% change: 3m vs 6m average volume")
    rank: int

    model_config = {"from_attributes": True}


class TopStockOut(BaseModel):
    symbol: str
    sector: str
    volume_surge_pct: float = Field(..., description="Recent 20-day avg vs 3-month avg")
    price_change_pct: float = Field(..., description="Price change over past 20 trading days")
    current_price: float
    avg_volume_20d: float
    avg_volume_3m: float

    model_config = {"from_attributes": True}
