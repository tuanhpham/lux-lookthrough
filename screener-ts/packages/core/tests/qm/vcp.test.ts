import { describe, it, expect } from 'vitest';
import { detectVcp } from '../../src/qm/vcp.js';
import { DEFAULT_QM_CONFIG } from '../../src/qm/config.js';
import type { Bar } from '../../src/types/market.js';
import { isoDate, uptrendSeries } from './helpers.js';

/**
 * Build a bar series by linearly interpolating between (barIndex, price)
 * waypoints, wrapping each close in a volatility band `vol` (high/low) and a
 * per-bar volume. Used to construct a textbook VCP.
 */
function buildFromWaypoints(
  waypoints: [number, number][],
  volAt: (i: number) => number,
  bandAt: (i: number) => number,
): Bar[] {
  const last = waypoints[waypoints.length - 1]![0];
  const bars: Bar[] = [];
  let wp = 0;
  for (let i = 0; i <= last; i++) {
    while (wp < waypoints.length - 1 && i > waypoints[wp + 1]![0]) wp++;
    const [x0, y0] = waypoints[wp]!;
    const [x1, y1] = waypoints[Math.min(wp + 1, waypoints.length - 1)]!;
    const close = x1 === x0 ? y0 : y0 + ((y1 - y0) * (i - x0)) / (x1 - x0);
    const band = bandAt(i);
    bars.push({
      date: isoDate(i),
      open: close,
      high: close * (1 + band),
      low: close * (1 - band),
      close,
      volume: volAt(i),
    });
  }
  return bars;
}

/** Textbook VCP: ~100% advance, then a base with 20→11→6→3% contracting
 * pullbacks, declining volume, and contracting volatility, tightening to the pivot. */
function textbookVcp(): Bar[] {
  const waypoints: [number, number][] = [
    [0, 50],
    [50, 80], // +60% leg (impulse)
    [60, 72], // dip
    [150, 100], // +39% leg (impulse); base anchors at this high
    [158, 80], // pullback 20%
    [166, 97],
    [174, 86], // pullback ~11%
    [182, 95],
    [190, 89], // pullback ~6%
    [198, 94],
    [206, 91], // pullback ~3%
    [214, 96], // tighten toward pivot
  ];
  return buildFromWaypoints(
    waypoints,
    (i) => (i < 150 ? 2_000_000 : 2_500_000 - ((2_500_000 - 700_000) * (i - 150)) / 64),
    (i) => (i < 150 ? 0.01 : Math.max(0.02 - (0.015 * (i - 150)) / 64, 0.004)),
  );
}

describe('detectVcp', () => {
  it('detects a textbook contracting base', () => {
    const r = detectVcp(textbookVcp());
    expect(r.isVcp).toBe(true);
    expect(r.contractions).toBeGreaterThanOrEqual(2);
    expect(r.previousAdvancePct).toBeGreaterThanOrEqual(30);
    expect(r.impulseCount).toBeGreaterThanOrEqual(1);
    expect(r.volumeContractionPct).toBeGreaterThan(0);
    expect(r.atrContractionPct).toBeGreaterThan(0);
    // Pivot is the highest high of the base (≈100 with the 1% band on day 150).
    expect(r.pivot).not.toBeNull();
    expect(r.pivot!).toBeGreaterThan(99);
    // Pullbacks should be monotonically contracting.
    for (let i = 1; i < r.contractions; i++) {
      expect(r.pullbacks[i]!).toBeLessThan(r.pullbacks[i - 1]!);
    }
  });

  it('rejects a clean trend with no contracting base', () => {
    const r = detectVcp(uptrendSeries(260));
    expect(r.isVcp).toBe(false);
  });

  it('rejects when the previous advance is below the configured minimum', () => {
    const cfg = {
      ...DEFAULT_QM_CONFIG,
      vcp: { ...DEFAULT_QM_CONFIG.vcp, minPreviousAdvancePct: 500 },
    };
    const r = detectVcp(textbookVcp(), cfg);
    expect(r.isVcp).toBe(false);
  });

  it('respects a stricter contraction requirement', () => {
    const cfg = {
      ...DEFAULT_QM_CONFIG,
      vcp: { ...DEFAULT_QM_CONFIG.vcp, minContractions: 99 },
    };
    const r = detectVcp(textbookVcp(), cfg);
    expect(r.isVcp).toBe(false);
  });
});
