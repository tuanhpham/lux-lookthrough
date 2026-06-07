"""
Nightly scan task — runs at 6 PM ET on market weekdays.

Steps:
1. Fetch and upsert OHLCV data for all tracked symbols.
2. Run the full sector volume scan.
3. Run the pattern scan for every symbol.
4. Persist signals (score >= 40) to the signals table.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.constants import SECTOR_STOCKS
from app.core.database import AsyncSessionLocal
from app.models.ohlcv import OHLCV
from app.models.signal import Signal
from app.services.data_fetcher import fetch_multiple
from app.services.pattern_engine import scan_stock
from app.tasks.celery_app import celery_app

log = logging.getLogger(__name__)

MIN_SIGNAL_SCORE = 40.0


async def _upsert_ohlcv(symbol: str, sector: str, df) -> int:
    """Upsert OHLCV rows for one symbol. Returns number of rows written."""
    if df.empty:
        return 0

    rows = [
        {
            "symbol": symbol,
            "date": idx.date(),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
            "sector": sector,
        }
        for idx, row in df.iterrows()
    ]

    async with AsyncSessionLocal() as session:
        # PostgreSQL upsert — do nothing on conflict (prices are final after market close)
        stmt = pg_insert(OHLCV).values(rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["symbol", "date"])
        await session.execute(stmt)
        await session.commit()

    return len(rows)


async def _save_signal(symbol: str, sector: str, result) -> None:
    """Persist a PatternResult to the signals table (upsert by symbol + date)."""
    async with AsyncSessionLocal() as session:
        today = date.today()
        # Remove today's existing signal for this symbol before re-inserting
        await session.execute(
            delete(Signal).where(Signal.symbol == symbol, Signal.signal_date == today)
        )
        session.add(
            Signal(
                symbol=symbol,
                sector=sector,
                signal_date=today,
                stage=result.stage.stage,
                score=result.score,
                entry_price=result.entry_price,
                stop_loss=result.stop_loss,
                target_price=result.target_price,
                risk_reward=result.risk_reward,
                vcp_contractions=result.consolidation.vcp_contractions,
            )
        )
        await session.commit()


async def _run() -> dict[str, int]:
    """Async body of the nightly scan."""
    all_symbols: list[tuple[str, str]] = [
        (sym, sector) for sector, syms in SECTOR_STOCKS.items() for sym in syms
    ]
    symbol_list = [s for s, _ in all_symbols]
    sector_map = {s: sec for s, sec in all_symbols}

    log.info("Nightly scan: fetching OHLCV for %d symbols…", len(symbol_list))
    data = await fetch_multiple(symbol_list, period="1y", max_concurrent=12)
    log.info("Nightly scan: received data for %d symbols", len(data))

    total_rows = 0
    signals_saved = 0

    for sym, df in data.items():
        sector = sector_map.get(sym, "Unknown")

        # 1. Upsert OHLCV
        n = await _upsert_ohlcv(sym, sector, df)
        total_rows += n

        # 2. Pattern scan + persist
        if len(df) >= 60:
            result = scan_stock(sym, df, sector=sector)
            if result.score >= MIN_SIGNAL_SCORE:
                await _save_signal(sym, sector, result)
                signals_saved += 1

    log.info(
        "Nightly scan complete: %d OHLCV rows upserted, %d signals saved",
        total_rows,
        signals_saved,
    )
    return {"ohlcv_rows": total_rows, "signals_saved": signals_saved}


@celery_app.task(
    name="app.tasks.nightly_scan.run_nightly_scan",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
)
def run_nightly_scan(self) -> dict[str, int]:
    """Celery task: nightly OHLCV fetch + pattern scan for all tracked symbols.

    Scheduled by celery beat at 6 PM ET, Mon-Fri.
    Retries up to 2 times on failure with a 5-minute delay.
    """
    try:
        return asyncio.run(_run())
    except Exception as exc:
        log.exception("Nightly scan failed: %s", exc)
        raise self.retry(exc=exc)
