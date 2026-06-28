import { describe, it, expect } from 'vitest';
import { detectEpisodicPivot } from '../../src/qm/episodicPivot.js';
import type { Bar } from '../../src/types/market.js';
import { isoDate } from './helpers.js';

/** A quiet base of `n` bars around `price`, then a final gap-up day. */
function epSeries(
  n: number,
  basePrice: number,
  gapDay: { open: number; high: number; low: number; close: number; volume: number },
): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    bars.push({
      date: isoDate(i),
      open: basePrice,
      high: basePrice * 1.01,
      low: basePrice * 0.99,
      close: basePrice,
      volume: 1_000_000,
    });
  }
  bars.push({ date: isoDate(n), ...gapDay });
  return bars;
}

describe('detectEpisodicPivot', () => {
  it('detects a strong earnings gap closing near the high', () => {
    // prior close 100 → open 110 (+10%), closes 113 at the top of the range,
    // 4× volume, clears the prior 60-day high of ~101.
    const r = detectEpisodicPivot(
      epSeries(70, 100, { open: 110, high: 114, low: 109, close: 113, volume: 4_000_000 }),
    );
    expect(r.isEp).toBe(true);
    expect(r.gapPct).toBeCloseTo(10, 2);
    expect(r.relativeVolume).toBeGreaterThanOrEqual(2);
    expect(r.gapAboveResistance).toBe(true);
    expect(r.gapScore).toBeGreaterThan(0);
    expect(r.catalyst).toBe('Price/volume gap');
  });

  it('rejects a weak close (closed near the low of the range)', () => {
    const r = detectEpisodicPivot(
      epSeries(70, 100, { open: 110, high: 114, low: 105, close: 106, volume: 4_000_000 }),
    );
    expect(r.isEp).toBe(false);
    expect(r.reason).toBe('weak close');
  });

  it('rejects when relative volume is too low', () => {
    const r = detectEpisodicPivot(
      epSeries(70, 100, { open: 110, high: 114, low: 109, close: 113, volume: 1_100_000 }),
    );
    expect(r.isEp).toBe(false);
    expect(r.reason).toBe('low relative volume');
  });

  it('rejects a small gap', () => {
    const r = detectEpisodicPivot(
      epSeries(70, 100, { open: 103, high: 106, low: 102, close: 105, volume: 4_000_000 }),
    );
    expect(r.isEp).toBe(false);
    expect(r.reason).toBe('gap too small');
  });

  it('adds optional EPS + revenue surprise to the catalyst and confidence', () => {
    const bars = epSeries(70, 100, { open: 110, high: 114, low: 109, close: 113, volume: 4_000_000 });
    const base = detectEpisodicPivot(bars);
    const boosted = detectEpisodicPivot(bars, undefined, {
      epsSurprisePositive: true,
      revenueSurprisePositive: true,
    });
    expect(boosted.isEp).toBe(true);
    expect(boosted.catalyst).toContain('EPS surprise');
    expect(boosted.catalyst).toContain('revenue surprise');
    expect(boosted.confidence).toBeGreaterThanOrEqual(base.confidence);
  });
});
