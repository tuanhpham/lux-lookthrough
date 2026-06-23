import { describe, it, expect } from 'vitest';
import { detectSurge, DEFAULT_SURGE_CONFIG } from '../../src/momentum/surge.js';
import { series } from '../qm/helpers.js';

describe('detectSurge', () => {
  it('flags a stock above EMA5 all week that gained >20% in two weeks', () => {
    // Steady compounding uptrend: close rises ~3%/day → ~34% over 10 bars, and
    // a rising series stays above its (lagging) EMA5 every day.
    const bars = series(40, (i) => 50 * Math.pow(1.03, i));
    const r = detectSurge(bars);
    expect(r.aboveEma).toBe(true);
    expect(r.gainPct).toBeGreaterThan(20);
    expect(r.isSurge).toBe(true);
  });

  it('rejects a flat stock (no 2-week gain)', () => {
    const r = detectSurge(series(40, () => 100));
    expect(r.gainPct).toBeCloseTo(0, 6);
    expect(r.isSurge).toBe(false);
  });

  it('rejects when price dipped below EMA5 during the week', () => {
    // Strong 2-week gain, but a sharp one-day dip on the penultimate bar pushes
    // that close below its EMA5, breaking the "above all week" condition.
    const bars = series(40, (i) => 50 * Math.pow(1.03, i));
    bars[bars.length - 2]!.close = bars[bars.length - 2]!.close * 0.8;
    const r = detectSurge(bars);
    expect(r.aboveEma).toBe(false);
    expect(r.isSurge).toBe(false);
  });

  it('respects a stricter min-gain threshold', () => {
    const bars = series(40, (i) => 50 * Math.pow(1.03, i));
    const r = detectSurge(bars, { ...DEFAULT_SURGE_CONFIG, minGainPct: 99 });
    expect(r.isSurge).toBe(false);
  });

  it('returns empty for too-short history', () => {
    const r = detectSurge(series(4, (i) => 100 + i));
    expect(r.isSurge).toBe(false);
    expect(r.gainPct).toBe(0);
  });
});
