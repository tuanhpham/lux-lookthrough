import { describe, it, expect } from 'vitest';
import { buildTradePlan, DEFAULT_TRADE_PLAN_CONFIG } from '../../src/planning/tradePlan.js';
import type { QmScanResult } from '../../src/qm/types.js';

/** Minimal QmScanResult with the fields buildTradePlan reads. */
function scanWith(levels: Partial<QmScanResult['levels']>, riskPct: number | null = null): QmScanResult {
  return {
    symbol: 'TEST',
    price: 100,
    setupType: 'VCP',
    qualityScore: 80,
    relativeStrength: 5,
    trend: {} as QmScanResult['trend'],
    vcp: { confidence: 70 } as QmScanResult['vcp'],
    ep: { confidence: 0 } as QmScanResult['ep'],
    levels: { entryPrice: null, stopLoss: null, targetPrice: null, riskReward: null, ...levels },
    riskPct,
  };
}

describe('buildTradePlan', () => {
  it('sizes by risk: shares ≈ (equity × risk%) / (entry − stop)', () => {
    // entry 100, stop 96 → $4 risk/share. 100k equity, 1% risk = $1000 → 250 sh.
    const plan = buildTradePlan(scanWith({ entryPrice: 100, stopLoss: 96, targetPrice: 112, riskReward: 3 }), {
      equity: 100_000,
      riskPctPerTrade: 1,
    });
    expect(plan.actionable).toBe(true);
    expect(plan.shares).toBe(250);
    expect(plan.riskAmount).toBeCloseTo(1000, 2);
    expect(plan.positionValue).toBeCloseTo(25_000, 2);
    expect(plan.expectedR).toBe(3);
  });

  it('caps the position at maxPositionPct of equity', () => {
    // Tiny risk/share (entry 100, stop 99.9 → $0.10) would size huge by risk;
    // the 25% concentration cap limits it to 250 sh ($25k of $100k).
    const plan = buildTradePlan(scanWith({ entryPrice: 100, stopLoss: 99.9, targetPrice: 130, riskReward: 3 }), {
      equity: 100_000,
      riskPctPerTrade: 1,
    });
    expect(plan.cappedByConcentration).toBe(true);
    expect(plan.shares).toBe(250); // floor(25% × 100k / 100)
    expect(plan.positionPct).toBeLessThanOrEqual(DEFAULT_TRADE_PLAN_CONFIG.maxPositionPct);
  });

  it('is not actionable without usable levels', () => {
    const plan = buildTradePlan(scanWith({ entryPrice: null, stopLoss: null }), { equity: 100_000, riskPctPerTrade: 1 });
    expect(plan.actionable).toBe(false);
    expect(plan.shares).toBe(0);
    expect(plan.positionValue).toBe(0);
  });

  it('rejects a non-positive risk per share', () => {
    const plan = buildTradePlan(scanWith({ entryPrice: 100, stopLoss: 100 }), { equity: 100_000, riskPctPerTrade: 1 });
    expect(plan.actionable).toBe(false);
    expect(plan.shares).toBe(0);
  });

  it('surfaces the best available confidence (VCP vs EP)', () => {
    const plan = buildTradePlan(scanWith({ entryPrice: 100, stopLoss: 96 }), { equity: 100_000, riskPctPerTrade: 1 });
    expect(plan.confidence).toBe(70);
  });
});
