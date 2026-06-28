import { describe, it, expect } from 'vitest';
import { DEFAULT_MOMENTUM_CONFIG } from '../../src/momentum/config.js';

describe('DEFAULT_MOMENTUM_CONFIG', () => {
  it('score weights total 100 (1M 15, 3M 25, 6M 25, RS 25, Liquidity 10)', () => {
    const w = DEFAULT_MOMENTUM_CONFIG.weights;
    expect(w.oneMonth + w.threeMonth + w.sixMonth + w.relativeStrength + w.liquidity).toBe(100);
  });

  it('classification cutoffs are monotonically increasing', () => {
    const c = DEFAULT_MOMENTUM_CONFIG.classification;
    expect(c.weakBelow).toBeLessThan(c.buildingBelow);
    expect(c.buildingBelow).toBeLessThan(c.strongBelow);
    expect(c.strongBelow).toBeLessThanOrEqual(100);
  });

  it('return periods increase 1M < 3M < 6M < 12M', () => {
    const p = DEFAULT_MOMENTUM_CONFIG.periods;
    expect(p.oneMonth).toBeLessThan(p.threeMonth);
    expect(p.threeMonth).toBeLessThan(p.sixMonth);
    expect(p.sixMonth).toBeLessThan(p.twelveMonth);
  });

  it('top fraction is within (0,1]', () => {
    expect(DEFAULT_MOMENTUM_CONFIG.filter.topPct).toBeGreaterThan(0);
    expect(DEFAULT_MOMENTUM_CONFIG.filter.topPct).toBeLessThanOrEqual(1);
  });
});
