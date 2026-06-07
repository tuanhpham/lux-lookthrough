"""General stock data endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.data_fetcher import (
    fetch_financials,
    fetch_fundamentals,
    fetch_ohlcv,
)

router = APIRouter()


class CandleOut(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class OHLCVResponse(BaseModel):
    symbol: str
    period: str
    candles: list[CandleOut]


@router.get("/{symbol}/ohlcv", response_model=OHLCVResponse)
async def get_ohlcv(symbol: str, period: str = "6mo") -> OHLCVResponse:
    """Fetch OHLCV data for a symbol — used to render the candlestick chart.

    Args:
        symbol: Ticker symbol.
        period: yfinance period string (1mo | 3mo | 6mo | 1y | 2y | 5y | max).
    """
    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}
    if period not in valid_periods:
        raise HTTPException(status_code=400, detail=f"period must be one of {valid_periods}")

    df = await fetch_ohlcv(symbol.upper(), period=period)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for symbol '{symbol}'")

    candles = [
        CandleOut(
            date=str(idx.date()),
            open=round(row["open"], 2),
            high=round(row["high"], 2),
            low=round(row["low"], 2),
            close=round(row["close"], 2),
            volume=row["volume"],
        )
        for idx, row in df.iterrows()
    ]

    return OHLCVResponse(symbol=symbol.upper(), period=period, candles=candles)


class FundamentalsResponse(BaseModel):
    symbol: str
    name: str | None = None
    short_name: str | None = None
    sector: str | None = None
    industry: str | None = None
    market_cap: float | None = None
    pe_ratio: float | None = None
    forward_pe: float | None = None
    eps: float | None = None
    forward_eps: float | None = None
    dividend_yield: float | None = None
    beta: float | None = None
    week52_high: float | None = None
    week52_low: float | None = None
    avg_volume: float | None = None
    profit_margin: float | None = None
    revenue_growth: float | None = None
    roe: float | None = None
    currency: str | None = None
    website: str | None = None
    summary: str | None = None
    current_price: float | None = None


@router.get("/{symbol}/fundamentals", response_model=FundamentalsResponse)
async def get_fundamentals(symbol: str) -> FundamentalsResponse:
    """Fetch company fundamentals (EPS, P/E, market cap, margins, etc.).

    Used to populate the expandable detail panel for each stock.
    """
    data: dict[str, Any] = await fetch_fundamentals(symbol.upper())
    return FundamentalsResponse(**data)


class FinancialPoint(BaseModel):
    period: str
    revenue: float | None = None
    net_income: float | None = None
    eps: float | None = None


class FinancialsResponse(BaseModel):
    symbol: str
    annual: list[FinancialPoint]
    quarterly: list[FinancialPoint]


@router.get("/{symbol}/financials", response_model=FinancialsResponse)
async def get_financials(symbol: str) -> FinancialsResponse:
    """Fetch revenue / net income / EPS history (annual + quarterly).

    Powers the fundamentals trend charts in the stock detail view.
    """
    data: dict[str, Any] = await fetch_financials(symbol.upper())
    return FinancialsResponse(**data)
