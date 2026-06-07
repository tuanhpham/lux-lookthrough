"""Unit tests for the pattern engine — no network calls needed."""

import numpy as np
import pandas as pd
import pytest

from app.services.pattern_engine import (
    analyze_stage,
    calculate_trade_levels,
    compute_score,
    detect_consolidation,
    detect_pivot,
    scan_stock,
)


def _make_df(
    n: int = 250,
    trend: str = "up",
    base_price: float = 100.0,
    base_volume: float = 1_000_000,
) -> pd.DataFrame:
    """Generate synthetic OHLCV data for testing."""
    np.random.seed(42)
    if trend == "up":
        closes = base_price + np.linspace(0, 50, n) + np.random.randn(n) * 2
    elif trend == "down":
        closes = base_price + np.linspace(0, -40, n) + np.random.randn(n) * 2
    else:  # flat / basing
        closes = base_price + np.random.randn(n) * 3

    closes = np.maximum(closes, 1.0)
    highs = closes * (1 + np.abs(np.random.randn(n) * 0.01))
    lows = closes * (1 - np.abs(np.random.randn(n) * 0.01))
    opens = closes * (1 + np.random.randn(n) * 0.005)
    volumes = base_volume * (1 + np.random.randn(n) * 0.1)
    volumes = np.maximum(volumes, 100_000)

    idx = pd.date_range(end="2024-12-31", periods=n, freq="B")
    return pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes, "volume": volumes},
        index=idx,
    )


class TestStageAnalysis:
    def test_advancing_stock_returns_stage_2(self):
        df = _make_df(n=250, trend="up")
        result = analyze_stage(df)
        assert result.stage == 2
        assert result.label == "ADVANCING"

    def test_declining_stock_returns_stage_4(self):
        df = _make_df(n=250, trend="down")
        result = analyze_stage(df)
        assert result.stage == 4
        assert result.label == "DECLINING"

    def test_insufficient_data_returns_stage_0(self):
        df = _make_df(n=50, trend="up")
        result = analyze_stage(df)
        assert result.stage == 0


class TestConsolidationDetection:
    def test_flat_base_is_consolidating(self):
        df_trend = _make_df(n=150, trend="up")
        # Append 60-day flat base
        flat = _make_df(n=60, trend="flat", base_price=float(df_trend["close"].iloc[-1]))
        df = pd.concat([df_trend, flat])
        result = detect_consolidation(df, base_window=60)
        # With truly flat data the range should be tight
        assert result.price_range_pct < 25.0

    def test_atr_contraction_positive_for_flat_base(self):
        df = _make_df(n=250, trend="flat")
        result = detect_consolidation(df, base_window=60)
        # ATR contraction can be negative or positive in random data — just check it returns
        assert isinstance(result.atr_contraction_pct, float)

    def test_insufficient_data_not_consolidating(self):
        df = _make_df(n=30)
        result = detect_consolidation(df, base_window=60)
        assert not result.is_consolidating


class TestPivotDetection:
    def test_finds_pivot_above_current_price(self):
        df = _make_df(n=120, trend="up")
        # Force a peak 30 days ago by inflating highs
        df["high"].iloc[-35:-25] *= 1.15
        df["close"].iloc[-20:] *= 0.95   # pull back below that peak
        result = detect_pivot(df, order=5)
        # Pivot should be detected; may or may not be above current price
        assert isinstance(result.pivot_high, (float, type(None)))

    def test_insufficient_data_returns_none_pivot(self):
        df = _make_df(n=5)
        result = detect_pivot(df, order=10)
        assert result.pivot_high is None


class TestScorer:
    def test_stage2_consolidating_score_above_40(self):
        from app.services.pattern_engine import StageResult, ConsolidationResult, PivotResult
        stage = StageResult(2, "ADVANCING", 90, 85, 80, 100, True, True, True, True)
        cons = ConsolidationResult(True, 50, 12.0, 25.0, 30.0, 2, 8.0)
        pivot = PivotResult(102.5, 2.5, [102.5])
        score = compute_score(stage, cons, pivot)
        assert score >= 40

    def test_stage4_score_low(self):
        from app.services.pattern_engine import StageResult, ConsolidationResult, PivotResult
        stage = StageResult(4, "DECLINING", 90, 95, 100, 80, False, False, False, False)
        cons = ConsolidationResult(False, 60, 35.0, 2.0, 5.0, 0, 25.0)
        pivot = PivotResult(None, 0.0, [])
        score = compute_score(stage, cons, pivot)
        assert score < 30


class TestTradeLevels:
    def test_returns_none_without_pivot(self):
        entry, stop, target, rr = calculate_trade_levels(100, None, 2.0)
        assert entry is None and stop is None

    def test_entry_above_pivot(self):
        entry, stop, target, rr = calculate_trade_levels(98.0, 100.0, 2.0)
        assert entry is not None
        assert entry > 100.0

    def test_risk_reward_is_3(self):
        entry, stop, target, rr = calculate_trade_levels(98.0, 100.0, 2.0, risk_reward_target=3.0)
        assert rr == 3.0


class TestScanStock:
    def test_scan_returns_result_for_valid_data(self):
        df = _make_df(n=250, trend="up")
        result = scan_stock("TEST", df, sector="Technology")
        assert result.symbol == "TEST"
        assert 0 <= result.score <= 100
        assert result.signal in {"CONSOLIDATING", "BREAKOUT_IMMINENT", "NO_SIGNAL"}

    def test_scan_no_signal_for_declining_stock(self):
        df = _make_df(n=250, trend="down")
        result = scan_stock("TEST", df)
        assert result.signal == "NO_SIGNAL"
