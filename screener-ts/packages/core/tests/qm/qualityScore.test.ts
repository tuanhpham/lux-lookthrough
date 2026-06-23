import { describe, it, expect } from 'vitest';
import { computeQmQuality } from '../../src/qm/qualityScore.js';
import { DEFAULT_QM_CONFIG } from '../../src/qm/config.js';
import type { QmQualityParts } from '../../src/qm/types.js';

const ALL_MAX: QmQualityParts = {
  trend: 1,
  previousAdvance: 1,
  vcp: 1,
  volume: 1,
  relativeStrength: 1,
  liquidity: 1,
  breakout: 1,
};
const ALL_ZERO: QmQualityParts = {
  trend: 0,
  previousAdvance: 0,
  vcp: 0,
  volume: 0,
  relativeStrength: 0,
  liquidity: 0,
  breakout: 0,
};

describe('computeQmQuality', () => {
  it('all-max inputs yield 100', () => {
    expect(computeQmQuality(ALL_MAX)).toBe(100);
  });

  it('all-zero inputs yield 0', () => {
    expect(computeQmQuality(ALL_ZERO)).toBe(0);
  });

  it('a single full bucket yields exactly its weight', () => {
    expect(computeQmQuality({ ...ALL_ZERO, vcp: 1 })).toBe(DEFAULT_QM_CONFIG.weights.vcp);
  });

  it('clamps out-of-range part strengths to [0,1]', () => {
    expect(computeQmQuality({ ...ALL_ZERO, trend: 5, breakout: -3 })).toBe(
      DEFAULT_QM_CONFIG.weights.trend,
    );
  });

  it('configurable weights shift the total', () => {
    const cfg = {
      ...DEFAULT_QM_CONFIG,
      weights: { ...DEFAULT_QM_CONFIG.weights, vcp: 50 },
    };
    expect(computeQmQuality({ ...ALL_ZERO, vcp: 1 }, cfg)).toBe(50);
  });
});
