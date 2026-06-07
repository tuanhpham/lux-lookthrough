"""General stock data endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.data_fetcher import fetch_ohlcv

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
        period: yfinance period string (1mo | 3mo | 6mo | 1y | 2y).
    """
    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y"}
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
