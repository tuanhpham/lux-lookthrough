import { describe, it, expect } from 'vitest';
import { rsi, rsiOfCloses } from '../../src/indicators/rsi.js';

describe('rsi', () => {
  it('matches Wilder\'s published worked example', () => {
    // The canonical RSI-14 dataset from Wilder's "New Concepts in Technical
    // Trading Systems", as reproduced by StockCharts. Hard-coded expectations
    // are the point: this pins the SMOOTHING, which is the one thing routinely
    // implemented wrong (an EMA with k = 2/(period+1) gives ~70.3 here).
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
      46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
      43.42, 42.66, 43.13,
    ];
    const out = rsi(closes, 14);
    // First defined value at index 14 (gains start at index 1, so 14 changes
    // land at index 14 — one later than atr/ema, deliberately).
    expect(Number.isNaN(out[13]!)).toBe(true);
    // The whole published RSI-14 column, not just its ends: an off-by-one in the
    // smoothing recursion reproduces the first value and then drifts.
    const expected = [
      70.46, 66.25, 66.48, 69.35, 66.29, 57.92, 62.88, 63.21, 56.01, 62.34,
      54.68, 50.44, 39.99, 41.46, 41.87, 45.46, 37.30, 33.08, 37.77,
    ];
    // 0.1 rather than exact: the published table rounds each intermediate average
    // to 2 dp and that rounding compounds down the column. Still far tighter than
    // the ~4-point gap a wrong (EMA-style) smoothing produces, which is what this
    // assertion exists to catch.
    expected.forEach((want, k) => expect(Math.abs(out[14 + k]! - want)).toBeLessThan(0.1));
  });

  it('returns 100 rather than Infinity for an unbroken rise', () => {
    // avgLoss is exactly 0 here, so a naive g/l is Infinity and every
    // downstream comparison (`rsi <= 40`) silently misbehaves.
    const out = rsi(Array.from({ length: 30 }, (_, i) => 100 + i), 14);
    expect(out[29]).toBe(100);
    expect(Number.isFinite(out[29]!)).toBe(true);
  });

  it('returns 0 for an unbroken decline', () => {
    const out = rsi(Array.from({ length: 30 }, (_, i) => 100 - i), 14);
    expect(out[29]).toBe(0);
  });

  it('returns 50 for a perfectly flat series', () => {
    // No gains and no losses: 0/0. Neither 0 nor 100 is defensible, and NaN
    // would leak into the mean-reversion gate, so it is pinned to neutral.
    const out = rsi(new Array(30).fill(100), 14);
    expect(out[29]).toBe(50);
  });

  it('aligns to the input length with a NaN warm-up', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i));
    const out = rsi(closes, 14);
    expect(out).toHaveLength(closes.length);
    expect(out.slice(0, 14).every(Number.isNaN)).toBe(true);
    expect(out.slice(14).every((v) => Number.isFinite(v))).toBe(true);
  });

  it('stays within 0..100 on noisy input', () => {
    // The mean-reversion gate compares against a fixed level, so a value outside
    // the bounds would be a silent logic break rather than a visible crash.
    const closes = Array.from({ length: 200 }, (_, i) => 100 + 20 * Math.sin(i / 3) + (i % 7));
    for (const v of rsi(closes, 14).filter((x) => !Number.isNaN(x))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('is all-NaN when there is not enough history', () => {
    // 14 values gives only 13 changes — not one full period.
    expect(rsi(Array.from({ length: 14 }, (_, i) => 100 + i), 14).every(Number.isNaN)).toBe(true);
    expect(rsi([], 14)).toEqual([]);
    expect(rsi([1, 2, 3], 0).every(Number.isNaN)).toBe(true);
  });

  it('reads bar closes via rsiOfCloses', () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({ close: 100 + i }));
    expect(rsiOfCloses(bars, 14)).toEqual(rsi(bars.map((b) => b.close), 14));
  });
});
