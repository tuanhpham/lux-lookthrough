/**
 * Screener filter/sort tests built on the golden fixtures (whose scores and
 * signals are already parity-verified against Python).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { screen } from '../src/screener/screen.js';
import { recommend } from '../src/screener/recommend.js';
import type { OHLCV, Bar } from '../src/types/market.js';

const here = dirname(fileURLToPath(import.meta.url));
const cases: { name: string; bars: Bar[]; expected: Record<string, unknown> }[] =
  JSON.parse(readFileSync(join(here, 'fixtures', 'golden.json'), 'utf8'));

const series: OHLCV[] = cases.map((c) => ({
  symbol: c.name.toUpperCase(),
  bars: c.bars,
}));

describe('screen()', () => {
  it('skips series with < minBars and scans the rest', () => {
    // SHORT_SERIES has 80 bars; default minBars=60 keeps it, but its score is low.
    const res = screen(series, { minBars: 60 });
    // 5 fixtures all have >= 60 bars (shortest is 80).
    expect(res.scanned).toBe(5);
  });

  it('sorts by score descending by default and respects minScore', () => {
    const res = screen(series, { minScore: 40 });
    // From golden: uptrend_tightening=84, strong_uptrend=62.5 pass >=40.
    const syms = res.results.map((r) => r.symbol);
    expect(syms).toEqual(['UPTREND_TIGHTENING', 'STRONG_UPTREND']);
    expect(res.results[0]!.score).toBeGreaterThanOrEqual(res.results[1]!.score);
  });

  it('filters by signal', () => {
    const res = screen(series, { signals: ['BREAKOUT_IMMINENT'] });
    expect(res.results.every((r) => r.signal === 'BREAKOUT_IMMINENT')).toBe(true);
    expect(res.results.map((r) => r.symbol)).toContain('UPTREND_TIGHTENING');
  });

  it('filters by stage', () => {
    // DOWNTREND scores -4.1, so a negative minScore is needed to keep it
    // (default minScore=0 would correctly exclude a sub-zero score).
    const res = screen(series, { stages: [4], minScore: -100 });
    expect(res.results.map((r) => r.symbol)).toEqual(['DOWNTREND']);
  });

  it('honours limit', () => {
    const res = screen(series, { limit: 1 });
    expect(res.results.length).toBe(1);
  });

  it('sorts ascending when descending=false', () => {
    const res = screen(series, { sortBy: 'score', descending: false });
    const scores = res.results.map((r) => r.score);
    const sorted = [...scores].sort((a, b) => a - b);
    expect(scores).toEqual(sorted);
  });
});

describe('recommend()', () => {
  it('breakout strategy keeps only score>=70 BREAKOUT_IMMINENT', () => {
    const res = recommend(series, 'breakout');
    expect(res.strategyLabel).toBe('Breakout-ready');
    expect(res.results.every((r) => r.score >= 70 && r.signal === 'BREAKOUT_IMMINENT')).toBe(
      true,
    );
    expect(res.results.map((r) => r.symbol)).toContain('UPTREND_TIGHTENING');
  });

  it('momentum strategy keeps only stage-2 score>=55', () => {
    const res = recommend(series, 'momentum');
    expect(res.results.every((r) => r.stage === 2 && r.score >= 55)).toBe(true);
  });
});
