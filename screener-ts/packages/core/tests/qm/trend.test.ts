import { describe, it, expect } from 'vitest';
import { trendFilter } from '../../src/qm/trend.js';
import { DEFAULT_QM_CONFIG } from '../../src/qm/config.js';
import { uptrendSeries, series } from './helpers.js';

describe('trendFilter', () => {
  it('passes a clean uptrend with ample liquidity', () => {
    const r = trendFilter(uptrendSeries(260));
    expect(r.passed).toBe(true);
    expect(r.aboveEma50).toBe(true);
    expect(r.ema50AboveEma150).toBe(true);
    expect(r.ema150AboveEma200).toBe(true);
    expect(r.ema200Rising).toBe(true);
    expect(r.reason).toBe('');
  });

  it('fails on a downtrend (price below EMAs / EMA200 falling)', () => {
    const down = series(260, (i) => 200 - 0.5 * i, () => 3_000_000);
    const r = trendFilter(down);
    expect(r.passed).toBe(false);
  });

  it('fails with insufficient history (< emaSlow + lookback)', () => {
    const r = trendFilter(uptrendSeries(100));
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('insufficient history');
  });

  it('fails the liquidity gate when volume is too low', () => {
    const thin = series(260, (i) => 50 + 0.5 * i, () => 100); // tiny volume
    const r = trendFilter(thin);
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('insufficient liquidity');
  });

  it('fails when price is too far below the 52-week high', () => {
    // Rise then sharply pull back so EMAs still stack but price is far off highs.
    const n = 260;
    const bars = series(
      n,
      (i) => (i < 220 ? 50 + 0.6 * i : 50 + 0.6 * 220 - 1.0 * (i - 220)),
      () => 3_000_000,
    );
    const cfg = { ...DEFAULT_QM_CONFIG, trend: { ...DEFAULT_QM_CONFIG.trend, maxPctBelow52wHigh: 5 } };
    const r = trendFilter(bars, cfg);
    expect(r.pctBelow52wHigh).toBeGreaterThan(5);
    expect(r.passed).toBe(false);
  });
});
