"""TimescaleDB hypertable for OHLCV price data."""

from datetime import date
from sqlalchemy import Date, Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OHLCV(Base):
    """One row per (symbol, date) — TimescaleDB hypertable in production."""

    __tablename__ = "ohlcv"

    symbol: Mapped[str] = mapped_column(String(10), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False)
    sector: Mapped[str] = mapped_column(String(64), nullable=True)

    __table_args__ = (Index("ix_ohlcv_symbol_date", "symbol", "date"),)
