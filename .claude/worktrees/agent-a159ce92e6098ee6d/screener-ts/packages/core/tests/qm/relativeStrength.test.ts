import { describe, it, expect } from 'vitest';
import { relativeStrength } from '../../src/qm/relativeStrength.js';
import { series } from './helpers.js';

describe('relativeStrength', () => {
  const strong = series(300, (i) => 50 * Math.pow(1.004, i)); // compounding up
  const weak = series(300, (i) => 50 + 0.02 * i); // nearly flat

  it('ranks a strong mover above a weak one', () => {
    expect(relativeStrength(strong)).toBeGreaterThan(relativeStrength(weak));
  });

  it('measures return relative to a benchmark when supplied', () => {
    // Against a strong benchmark, the weak stock's relative strength is negative.
    const rel = relativeStrength(weak, undefined, strong);
    expect(rel).toBeLessThan(0);
    expect(Number.isFinite(rel)).toBe(true);
  });

  it('returns a finite number with the absolute fallback', () => {
    const rel = relativeStrength(strong);
    expect(Number.isFinite(rel)).toBe(true);
  });

  it('returns 0 for too-short series', () => {
    expect(relativeStrength(series(1, () => 50))).toBe(0);
  });
});
