import { describe, it, expect } from 'vitest';
import {
  computeReturns,
  computeMomentumScore,
  classifyMomentum,
  rankMomentum,
} from '../../src/momentum/momentumEngine.js';
import type { OHLCV } from '../../src/types/market.js';
import { series } from '../qm/helpers.js';

const strong = series(300, (i) => 50 * Math.pow(1.005, i), () => 5_000_000); // compounding up
const weak = series(300, (i) => 100 - 0.05 * i, () => 5_000_000); // slow decline
const flat = series(300, () => 100, () => 5_000_000);

describe('computeReturns', () => {
  it('computes positive returns for a rising series and null for too-short windows', () => {
    const r = computeReturns(strong);
    expect(r.oneMonth!).toBeGreaterThan(0);
    expect(r.threeMonth!).toBeGreaterThan(0);
    expect(r.sixMonth!).toBeGreaterThan(0);
    const short = computeReturns(series(10, (i) => 100 + i));
    expect(short.sixMonth).toBeNull();
  });

  it('flat series yields ~0 returns', () => {
    const r = computeReturns(flat);
    expect(r.threeMonth).toBeCloseTo(0, 6);
  });
});

describe('computeMomentumScore', () => {
  it('scores a strong mover above a weak one', () => {
    const s = computeMomentumScore('STRONG', strong);
    const w = computeMomentumScore('WEAK', weak);
    expect(s.momentumScore).toBeGreaterThan(w.momentumScore);
    expect(s.momentumScore).toBeGreaterThanOrEqual(0);
    expect(s.momentumScore).toBeLessThanOrEqual(100);
  });

  it('includes ATR%, dollar volume and distance from 52w high', () => {
    const s = computeMomentumScore('STRONG', strong);
    expect(s.atrPct).toBeGreaterThan(0);
    expect(s.dollarVolume).toBeGreaterThan(0);
    expect(s.distanceFrom52wHighPct).toBeGreaterThanOrEqual(0);
  });

  it('gives a standalone classification (not hardcoded "Weak") for a single symbol', () => {
    // The detail modal scores one stock at a time (no peer set for a percentile),
    // so the classification must fall back to a score-based bucket. A strong
    // mover should not come back "Weak".
    const s = computeMomentumScore('STRONG', strong);
    expect(s.classification).not.toBe('Weak');
  });
});

describe('classifyMomentum', () => {
  it('maps percentiles to the four buckets', () => {
    expect(classifyMomentum(10)).toBe('Weak');
    expect(classifyMomentum(50)).toBe('Building');
    expect(classifyMomentum(80)).toBe('Strong');
    expect(classifyMomentum(95)).toBe('Explosive');
  });
});

describe('rankMomentum', () => {
  it('assigns percentile ranks and sorts by score desc', () => {
    const map = new Map<string, OHLCV>([
      ['STRONG', { symbol: 'STRONG', bars: strong }],
      ['WEAK', { symbol: 'WEAK', bars: weak }],
      ['FLAT', { symbol: 'FLAT', bars: flat }],
    ]);
    const ranked = rankMomentum(map);
    expect(ranked.length).toBe(3);
    expect(ranked[0]!.symbol).toBe('STRONG');
    expect(ranked[0]!.momentumScore).toBeGreaterThanOrEqual(ranked[1]!.momentumScore);
    // Highest scorer gets the top percentile.
    expect(ranked[0]!.percentileRank).toBe(100);
  });

  it('skips symbols with too little history', () => {
    const map = new Map<string, OHLCV>([
      ['STRONG', { symbol: 'STRONG', bars: strong }],
      ['SHORT', { symbol: 'SHORT', bars: series(20, (i) => 100 + i) }],
    ]);
    const ranked = rankMomentum(map);
    expect(ranked.map((r) => r.symbol)).toEqual(['STRONG']);
  });

  it('measures relative strength against a benchmark', () => {
    const s = computeMomentumScore('STRONG', strong, weak); // strong vs weak benchmark
    expect(s.relativeStrength).toBeGreaterThan(0);
  });
});
