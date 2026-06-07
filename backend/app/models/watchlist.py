"""Personal watchlists — named collections of symbols the user tracks."""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Name of the watchlist that pre-existing (single-list) installs are migrated
# into, and that the UI falls back to when no list is specified.
DEFAULT_WATCHLIST_NAME = "My Watchlist"


class Watchlist(Base):
    """A named collection of symbols (e.g. "Tech", "Long-term holds")."""

    __tablename__ = "watchlists"
    __table_args__ = (UniqueConstraint("name", name="uq_watchlist_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    items: Mapped[list["WatchlistItem"]] = relationship(
        back_populates="watchlist",
        cascade="all, delete-orphan",
        order_by="WatchlistItem.created_at",
    )


class WatchlistItem(Base):
    """One symbol on a watchlist, with an optional note."""

    __tablename__ = "watchlist"
    __table_args__ = (
        UniqueConstraint("watchlist_id", "symbol", name="uq_watchlist_item"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    watchlist_id: Mapped[int | None] = mapped_column(
        ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=True, index=True
    )
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    note: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    watchlist: Mapped["Watchlist"] = relationship(back_populates="items")
