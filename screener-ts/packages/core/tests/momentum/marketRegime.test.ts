import { describe, it, expect } from 'vitest';
import { detectRegime } from '../../src/momentum/marketRegime.js';
import { series, uptrendSeries } from '../qm/helpers.js';

describe('detectRegime', () => {
  it('classifies a clean uptrend as BULL / risk-on', () => {
    const r = detectRegime(uptrendSeries(260));
    expect(r.regimeType).toBe('BULL');
    expect(r.riskOn).toBe(true);
    expect(r.emaStacked).toBe(true);
    expect(r.ema200Rising).toBe(true);
    expect(r.strengthScore).toBeGreaterThan(50);
  });

  it('classifies a sustained downtrend as BEAR / risk-off', () => {
    const down = series(260, (i) => 300 - 0.8 * i);
    const r = detectRegime(down);
    expect(r.regimeType).toBe('BEAR');
    expect(r.riskOn).toBe(false);
    expect(r.aboveEma200).toBe(false);
  });

  it('strengthScore stays within [0,100]', () => {
    for (const bars of [uptrendSeries(260), series(260, (i) => 300 - 0.8 * i)]) {
      const r = detectRegime(bars);
      expect(r.strengthScore).toBeGreaterThanOrEqual(0);
      expect(r.strengthScore).toBeLessThanOrEqual(100);
    }
  });

  it('returns TRANSITION when there is insufficient history', () => {
    const r = detectRegime(uptrendSeries(100));
    expect(r.regimeType).toBe('TRANSITION');
    expect(r.strengthScore).toBe(0);
  });

  it('a weak QQQ blocks a BULL call even with a strong SPY', () => {
    const spy = uptrendSeries(260);
    const qqq = series(260, (i) => 300 - 0.8 * i); // QQQ below its EMA200
    const r = detectRegime(spy, qqq);
    expect(r.regimeType).not.toBe('BULL');
  });
});
