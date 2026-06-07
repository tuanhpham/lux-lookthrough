"""
Pattern Engine — Consolidation + Pivot Pattern Detector.

Implements:
  - Stan Weinstein Stage Analysis (1-4)
  - VCP-style consolidation detection (ATR contraction, price range, volume dry-up)
  - Pivot high detection via scipy argrelextrema
  - Conviction scoring (0-100)
  - Entry / stop-loss / target / R:R calculator
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
from scipy.signal import argrelextrema

try:
    import talib
    _TALIB_AVAILABLE = True
except ImportError:  # pragma: no cover
    _TALIB_AVAILABLE = False


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class StageResult:
    stage: int                      # 1=base, 2=advance, 3=top, 4=decline
    label: str
    ma_50: float
    ma_150: float
    ma_200: float
    price: float
    above_ma50: bool
    above_ma150: bool
    above_ma200: bool
    ma200_trending_up: bool         # 200-day MA higher than 1 month ago


@dataclass
class ConsolidationResult:
    is_consolidating: bool
    days_in_base: int
    price_range_pct: float          # (high - low) / low over base window
    atr_contraction_pct: float      # recent ATR vs base-start ATR
    volume_dry_up_pct: float        # recent avg vol vs base-start avg vol
    vcp_contractions: int           # number of distinct ATR shrinkage cycles
    tightest_range_pct: float       # tightest 10-day range within base


@dataclass
class PivotResult:
    pivot_high: Optional[float]
    distance_to_pivot_pct: float    # how close price is to pivot (0 = at pivot)
    recent_pivots: list[float] = field(default_factory=list)


@dataclass
class PatternResult:
    symbol: str
    stage: StageResult
    consolidation: ConsolidationResult
    pivot: PivotResult
    signal: str                     # CONSOLIDATING | BREAKOUT_IMMINENT | NO_SIGNAL
    score: float                    # 0-100
    entry_price: Optional[float]
    stop_loss: Optional[float]
    target_price: Optional[float]
    risk_reward: Optional[float]


# ── Stage Analysis (Weinstein) ────────────────────────────────────────────────

def analyze_stage(df: pd.DataFrame) -> StageResult:
    """Classify the stock's current Weinstein stage.

    Stage 1 — Basing/Neglect: price range-bound near flattening MAs.
    Stage 2 — Advancing: price above all rising MAs (the buy zone).
    Stage 3 — Topping: price extended, MAs flattening/diverging.
    Stage 4 — Declining: price below MAs, MAs in downtrend.

    Args:
        df: OHLCV DataFrame with at least 200 rows.

    Returns:
        StageResult with stage number, label, and MA context.
    """
    if len(df) < 200:
        return StageResult(0, "INSUFFICIENT_DATA", 0, 0, 0, 0, False, False, False, False)

    closes = df["close"].values.astype(float)
    price = closes[-1]

    ma50 = float(np.mean(closes[-50:]))
    ma150 = float(np.mean(closes[-150:]))
    ma200 = float(np.mean(closes[-200:]))
    # Compare 200-day MA now vs ~20 trading days ago
    ma200_month_ago = float(np.mean(closes[-220:-20])) if len(closes) >= 220 else ma200

    above_50 = price > ma50
    above_150 = price > ma150
    above_200 = price > ma200
    ma200_up = ma200 > ma200_month_ago

    if above_50 and above_150 and above_200 and ma200_up:
        stage, label = 2, "ADVANCING"
    elif above_50 and above_150 and above_200 and not ma200_up:
        stage, label = 3, "TOPPING"
    elif not above_50 and not above_150 and not above_200 and not ma200_up:
        stage, label = 4, "DECLINING"
    else:
        stage, label = 1, "BASING"

    return StageResult(
        stage=stage, label=label,
        ma_50=round(ma50, 2), ma_150=round(ma150, 2), ma_200=round(ma200, 2),
        price=round(price, 2),
        above_ma50=above_50, above_ma150=above_150, above_ma200=above_200,
        ma200_trending_up=ma200_up,
    )


# ── ATR helper ────────────────────────────────────────────────────────────────

def _compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Compute ATR using TA-Lib if available, else pure-pandas fallback."""
    if _TALIB_AVAILABLE:
        atr = talib.ATR(
            df["high"].values.astype(float),
            df["low"].values.astype(float),
            df["close"].values.astype(float),
            timeperiod=period,
        )
        return pd.Series(atr, index=df.index)

    # Pandas fallback
    high = df["high"]
    low = df["low"]
    prev_close = df["close"].shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()


# ── Consolidation Detection ───────────────────────────────────────────────────

def detect_consolidation(
    df: pd.DataFrame,
    base_window: int = 60,
    min_days: int = 15,
) -> ConsolidationResult:
    """Detect if the stock is in a VCP-style consolidation base.

    Criteria checked:
    - Price range % within the base window (tight = good)
    - ATR contraction: recent ATR vs ATR at start of base
    - Volume dry-up: recent avg volume vs baseline avg volume
    - VCP contraction count: number of discrete ATR shrinkage pivots

    Args:
        df: OHLCV DataFrame (needs at least base_window + 20 rows).
        base_window: Number of trading days to analyze as the base.
        min_days: Minimum days for a valid base.

    Returns:
        ConsolidationResult with all metrics.
    """
    if len(df) < base_window + 20:
        return ConsolidationResult(False, 0, 100.0, 100.0, 100.0, 0, 100.0)

    base = df.iloc[-base_window:].copy()
    atr_series = _compute_atr(df, 14).iloc[-base_window:]

    base_high = base["high"].max()
    base_low = base["low"].min()
    price_range_pct = round((base_high - base_low) / base_low * 100, 2)

    # ATR contraction: compare first 10 days vs last 10 days of base
    atr_start = atr_series.iloc[:10].mean()
    atr_end = atr_series.iloc[-10:].mean()
    if atr_start > 0:
        atr_contraction_pct = round((1 - atr_end / atr_start) * 100, 2)
    else:
        atr_contraction_pct = 0.0

    # Volume dry-up: compare last 10d avg vs first 30d of base
    vol_baseline = base["volume"].iloc[:30].mean()
    vol_recent = base["volume"].iloc[-10:].mean()
    if vol_baseline > 0:
        volume_dry_up_pct = round((1 - vol_recent / vol_baseline) * 100, 2)
    else:
        volume_dry_up_pct = 0.0

    # VCP contraction count — count peaks in ATR series (each peak-to-trough = 1 contraction)
    atr_vals = atr_series.dropna().values
    vcp_count = 0
    if len(atr_vals) > 10:
        peaks = argrelextrema(atr_vals, np.greater, order=5)[0]
        troughs = argrelextrema(atr_vals, np.less, order=5)[0]
        # Count valid peak→trough pairs where ATR shrinks by >10%
        for peak_idx in peaks:
            subsequent_troughs = troughs[troughs > peak_idx]
            if len(subsequent_troughs) > 0:
                trough_idx = subsequent_troughs[0]
                if atr_vals[peak_idx] > 0:
                    contraction = (atr_vals[peak_idx] - atr_vals[trough_idx]) / atr_vals[peak_idx]
                    if contraction > 0.10:
                        vcp_count += 1

    # Tightest 10-day price range within the base
    rolling_range = base["high"].rolling(10).max() - base["low"].rolling(10).min()
    rolling_range_pct = (rolling_range / base["low"].rolling(10).min() * 100).dropna()
    tightest_range_pct = round(rolling_range_pct.min(), 2) if not rolling_range_pct.empty else price_range_pct

    # Is it actually consolidating?
    is_consolidating = (
        price_range_pct < 30.0        # base is not too wide
        and atr_contraction_pct > 5.0 # ATR is contracting
        and base_window >= min_days
    )

    return ConsolidationResult(
        is_consolidating=is_consolidating,
        days_in_base=base_window,
        price_range_pct=price_range_pct,
        atr_contraction_pct=atr_contraction_pct,
        volume_dry_up_pct=volume_dry_up_pct,
        vcp_contractions=vcp_count,
        tightest_range_pct=tightest_range_pct,
    )


# ── Pivot Point Detection ─────────────────────────────────────────────────────

def detect_pivot(df: pd.DataFrame, order: int = 10) -> PivotResult:
    """Find the most recent pivot high breakout level.

    Uses scipy.argrelextrema on the high series to identify local maxima.
    The most recent local high above the current price is the resistance/pivot.

    Args:
        df: OHLCV DataFrame (at least 60 rows recommended).
        order: How many candles on each side must be lower for a valid pivot.

    Returns:
        PivotResult with pivot_high level and distance to it.
    """
    if len(df) < order * 2 + 1:
        return PivotResult(None, 0.0)

    highs = df["high"].values.astype(float)
    current_price = df["close"].iloc[-1]

    peak_indices = argrelextrema(highs, np.greater_equal, order=order)[0]
    if len(peak_indices) == 0:
        return PivotResult(None, 0.0)

    pivot_prices = [round(highs[i], 2) for i in peak_indices]

    # The breakout pivot is the most recent peak above current price
    overhead_pivots = [p for p in pivot_prices if p > current_price * 0.98]
    pivot_high = min(overhead_pivots) if overhead_pivots else None

    if pivot_high:
        dist_pct = round((pivot_high - current_price) / current_price * 100, 2)
    else:
        dist_pct = 0.0

    return PivotResult(
        pivot_high=pivot_high,
        distance_to_pivot_pct=dist_pct,
        recent_pivots=pivot_prices[-5:],
    )


# ── Conviction Scorer ─────────────────────────────────────────────────────────

def compute_score(
    stage: StageResult,
    cons: ConsolidationResult,
    pivot: PivotResult,
) -> float:
    """Compute a 0-100 conviction score for a consolidation/breakout setup.

    Scoring rubric (max points):
    - Stage 2 (advancing)           : 25 pts
    - Stage 1 (basing, near MA200)  : 10 pts
    - ATR contraction >= 20%        : 20 pts  (scaled)
    - Price range < 15%             : 15 pts  (scaled)
    - Volume dry-up >= 20%          : 15 pts  (scaled)
    - VCP contractions (1=5, 2=10, 3+=15) : 15 pts
    - Pivot distance < 3%           : 10 pts  (scaled)

    Args:
        stage: Stage analysis result.
        cons: Consolidation metrics.
        pivot: Pivot detection result.

    Returns:
        Score from 0 to 100.
    """
    score = 0.0

    # Stage bonus
    if stage.stage == 2:
        score += 25
    elif stage.stage == 1:
        score += 10

    # ATR contraction (0-20 pts, linear from 0% to 30%)
    atr_pts = min(cons.atr_contraction_pct / 30.0, 1.0) * 20
    score += atr_pts

    # Price range tightness (0-15 pts, 30% range = 0 pts, 5% = 15 pts)
    range_pts = max(0, (30.0 - cons.price_range_pct) / 25.0) * 15
    score += min(range_pts, 15)

    # Volume dry-up (0-15 pts, linear from 0% to 40%)
    vol_pts = min(max(cons.volume_dry_up_pct, 0) / 40.0, 1.0) * 15
    score += vol_pts

    # VCP contraction count
    vcp_pts = min(cons.vcp_contractions * 5, 15)
    score += vcp_pts

    # Proximity to pivot (0-10 pts, within 5% = full, >10% = 0)
    if pivot.pivot_high and pivot.distance_to_pivot_pct >= 0:
        prox_pts = max(0, (5.0 - pivot.distance_to_pivot_pct) / 5.0) * 10
        score += prox_pts

    return round(min(score, 100.0), 1)


# ── Entry / Stop / Target Calculator ─────────────────────────────────────────

def calculate_trade_levels(
    current_price: float,
    pivot_high: Optional[float],
    atr: float,
    atr_multiplier_stop: float = 1.5,
    risk_reward_target: float = 3.0,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """Calculate entry, stop-loss, target, and R:R ratio.

    Entry  : 1 cent above the pivot high (breakout buy).
    Stop   : entry - (ATR * multiplier), also respects the base low.
    Target : entry + (risk * risk_reward_target).
    R:R    : (target - entry) / (entry - stop).

    Args:
        current_price: Current last price.
        pivot_high: Resistance/pivot level.
        atr: Current ATR value.
        atr_multiplier_stop: ATR multiplier for stop distance.
        risk_reward_target: Desired R:R multiple for target.

    Returns:
        Tuple of (entry, stop_loss, target, risk_reward) — all None if no pivot.
    """
    if pivot_high is None or atr <= 0:
        return None, None, None, None

    entry = round(pivot_high * 1.001, 2)          # 0.1% above pivot = breakout trigger
    stop = round(entry - atr * atr_multiplier_stop, 2)
    risk = entry - stop
    if risk <= 0:
        return entry, stop, None, None

    target = round(entry + risk * risk_reward_target, 2)
    rr = round(risk_reward_target, 2)

    return entry, stop, target, rr


# ── Top-level scan function ───────────────────────────────────────────────────

def scan_stock(symbol: str, df: pd.DataFrame, sector: str | None = None) -> PatternResult:
    """Run the full pattern scan on a single stock.

    Args:
        symbol: Ticker symbol.
        df: OHLCV DataFrame with at least 220 rows for reliable results.
        sector: Optional sector label.

    Returns:
        PatternResult with all sub-results and final score.
    """
    stage = analyze_stage(df)
    cons = detect_consolidation(df)
    pivot = detect_pivot(df)

    score = compute_score(stage, cons, pivot)

    # Determine signal
    if not cons.is_consolidating or stage.stage == 4:
        signal = "NO_SIGNAL"
    elif score >= 70 and pivot.pivot_high and pivot.distance_to_pivot_pct <= 3.0:
        signal = "BREAKOUT_IMMINENT"
    elif cons.is_consolidating and score >= 40:
        signal = "CONSOLIDATING"
    else:
        signal = "NO_SIGNAL"

    # Current ATR for trade level calc
    atr_series = _compute_atr(df, 14)
    current_atr = float(atr_series.dropna().iloc[-1]) if not atr_series.dropna().empty else 0.0
    current_price = float(df["close"].iloc[-1])

    entry, stop, target, rr = calculate_trade_levels(
        current_price, pivot.pivot_high, current_atr
    )

    return PatternResult(
        symbol=symbol,
        stage=stage,
        consolidation=cons,
        pivot=pivot,
        signal=signal,
        score=score,
        entry_price=entry,
        stop_loss=stop,
        target_price=target,
        risk_reward=rr,
    )
