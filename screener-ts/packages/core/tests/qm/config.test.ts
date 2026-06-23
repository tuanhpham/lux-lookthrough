import { describe, it, expect } from 'vitest';
import { DEFAULT_QM_CONFIG } from '../../src/qm/config.js';

describe('DEFAULT_QM_CONFIG', () => {
  it('weights total 100', () => {
    const w = DEFAULT_QM_CONFIG.weights;
    const sum =
      w.trend + w.previousAdvance + w.vcp + w.volume + w.relativeStrength + w.liquidity + w.breakout;
    expect(sum).toBe(100);
  });

  it('rs periods and weights have equal length', () => {
    expect(DEFAULT_QM_CONFIG.rs.periods.length).toBe(DEFAULT_QM_CONFIG.rs.weights.length);
  });

  it('rs weights sum to ~1', () => {
    const s = DEFAULT_QM_CONFIG.rs.weights.reduce((a, b) => a + b, 0);
    expect(s).toBeCloseTo(1, 6);
  });

  it('all numeric thresholds are positive', () => {
    const { trend, vcp, ep } = DEFAULT_QM_CONFIG;
    for (const v of [
      trend.emaFast,
      trend.emaMid,
      trend.emaSlow,
      trend.maxPctBelow52wHigh,
      trend.minDollarVolume,
      vcp.minPreviousAdvancePct,
      vcp.minBaseLength,
      vcp.maxBaseLength,
      ep.minGapPct,
      ep.minRelativeVolume,
    ]) {
      expect(v).toBeGreaterThan(0);
    }
  });
});
