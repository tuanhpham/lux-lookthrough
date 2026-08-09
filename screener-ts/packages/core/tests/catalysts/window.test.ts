import { describe, it, expect } from 'vitest';
import {
  dateRange,
  mergeEvents,
  filterEvents,
  groupByDate,
  hasCoverage,
  uncoveredKinds,
  dayRisks,
  isWeekend,
} from '../../src/catalysts/window.js';
import type { CatalystEvent, CatalystCoverage } from '../../src/catalysts/types.js';

function ev(p: Partial<CatalystEvent> & { id: string; date: string }): CatalystEvent {
  return {
    kind: 'earnings', timing: 'amc', confidence: 'estimated', symbol: 'AAA',
    title: 'Test', impact: 50, source: 'nasdaq', ...p,
  };
}

describe('dateRange', () => {
  it('is inclusive of both ends and spans months', () => {
    expect(dateRange('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02',
    ]);
  });

  it('produces exactly 32 days for a 30-day-ahead window', () => {
    expect(dateRange('2026-08-07', '2026-09-07')).toHaveLength(32);
  });

  it('flags weekends', () => {
    expect(isWeekend('2026-08-08')).toBe(true);  // Saturday
    expect(isWeekend('2026-08-07')).toBe(false); // Friday
  });

  it('still yields a full window when opened ON a weekend', () => {
    // Regression: the Calendar was reported broken "because it's Sunday". The
    // window math is fine on a weekend — the failure was elsewhere — but pin the
    // behaviour so a future weekend-skipping change cannot quietly truncate it.
    const sunday = '2026-08-09';
    expect(isWeekend(sunday)).toBe(true);
    const days = dateRange(sunday, '2026-09-08');
    expect(days).toHaveLength(31);
    expect(days[0]).toBe(sunday); // the grid renders the weekend cell itself
    // Only the SWEEP skips weekends; a Sunday start still has 22 trading days.
    expect(days.filter((d) => !isWeekend(d))).toHaveLength(22);
  });
});

describe('mergeEvents', () => {
  it('dedupes by id, letting later sources win', () => {
    const a = ev({ id: 'earnings:AAA:2026-08-10', title: 'from nasdaq' });
    const b = ev({ id: 'earnings:AAA:2026-08-10', title: 'from manual', source: 'manual' });
    const out = mergeEvents([a], [b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe('from manual');
  });

  it('sorts by date, then impact desc', () => {
    const out = mergeEvents([
      ev({ id: '1', date: '2026-08-12', impact: 30 }),
      ev({ id: '2', date: '2026-08-10', impact: 40 }),
      ev({ id: '3', date: '2026-08-10', impact: 90 }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['3', '2', '1']);
  });
});

describe('filterEvents', () => {
  const events = [
    ev({ id: 'a', date: '2026-08-10', symbol: 'AAPL', marketCap: 3e12, impact: 85 }),
    ev({ id: 'b', date: '2026-08-10', symbol: 'TINY', marketCap: 50e6, impact: 45 }),
    ev({ id: 'c', date: '2026-08-10', symbol: 'NOCAP', marketCap: null, impact: 60 }),
    ev({ id: 'd', date: '2026-08-12', symbol: null, kind: 'macro', title: 'CPI', impact: 85 }),
  ];

  it('keeps market-wide events even in watchlist mode', () => {
    // A Fed day applies to every holding — filtering it out by symbol is wrong.
    const out = filterEvents(events, { symbols: ['AAPL'] });
    expect(out.map((e) => e.id)).toEqual(['a', 'd']);
  });

  it('drops micro caps below the threshold', () => {
    expect(filterEvents(events, { minMarketCap: 1e9 }).map((e) => e.id)).not.toContain('b');
  });

  it('keeps rows whose market cap is unknown rather than hiding them', () => {
    expect(filterEvents(events, { minMarketCap: 1e9 }).map((e) => e.id)).toContain('c');
  });

  it('filters by kind and impact', () => {
    expect(filterEvents(events, { kinds: ['macro'] }).map((e) => e.id)).toEqual(['d']);
    expect(filterEvents(events, { minImpact: 80 }).map((e) => e.id)).toEqual(['a', 'd']);
  });
});

describe('groupByDate', () => {
  it('includes empty days so the grid can render every cell', () => {
    const map = groupByDate([ev({ id: 'a', date: '2026-08-08' })], '2026-08-07', '2026-08-09');
    expect([...map.keys()]).toEqual(['2026-08-07', '2026-08-08', '2026-08-09']);
    expect(map.get('2026-08-07')).toEqual([]);
    expect(map.get('2026-08-08')).toHaveLength(1);
  });

  it('ignores events outside the window', () => {
    const map = groupByDate([ev({ id: 'a', date: '2026-09-30' })], '2026-08-07', '2026-08-09');
    expect([...map.values()].flat()).toEqual([]);
  });
});

describe('coverage — "no data" is not "no events"', () => {
  const coverage: CatalystCoverage[] = [
    { kind: 'earnings', until: '2026-09-07' },
    // The Nasdaq econ feed runs dry after ~3 weeks; this is the real limit.
    { kind: 'macro', until: '2026-08-25', failedDates: ['2026-08-19'] },
  ];

  it('reports coverage inside the horizon', () => {
    expect(hasCoverage(coverage, 'macro', '2026-08-20')).toBe(true);
    expect(hasCoverage(coverage, 'earnings', '2026-09-07')).toBe(true);
  });

  it('reports NO coverage past the horizon', () => {
    // An empty macro cell on Sep 10 means "unknown", not "nothing scheduled".
    expect(hasCoverage(coverage, 'macro', '2026-09-10')).toBe(false);
  });

  it('treats a failed fetch day as uncovered', () => {
    expect(hasCoverage(coverage, 'macro', '2026-08-19')).toBe(false);
  });

  it('treats an unfetched kind as uncovered', () => {
    expect(hasCoverage(coverage, 'dividend', '2026-08-10')).toBe(false);
  });

  it('lists which kinds lack data for a day', () => {
    // Sep 1: earnings still covered (until Sep 7), macro already dry (Aug 25).
    expect(uncoveredKinds(coverage, '2026-09-01', ['earnings', 'macro'])).toEqual(['macro']);
    expect(uncoveredKinds(coverage, '2026-08-20', ['earnings', 'macro'])).toEqual([]);
    // Past every horizon, both are unknown.
    expect(uncoveredKinds(coverage, '2026-09-10', ['earnings', 'macro'])).toEqual(['earnings', 'macro']);
  });

  it('treats weekends as covered, however far out', () => {
    // The sweep skips weekends to save ~8 requests per window. Without this,
    // every Sat/Sun past a horizon would be flagged "no data" — crying wolf on
    // days when US markets are shut and no agency publishes anything.
    expect(hasCoverage(coverage, 'macro', '2026-09-12')).toBe(true);   // Saturday
    expect(hasCoverage(coverage, 'earnings', '2026-09-13')).toBe(true); // Sunday
    expect(uncoveredKinds(coverage, '2026-09-12', ['earnings', 'macro'])).toEqual([]);
  });

  it('still flags a WEEKDAY past the horizon', () => {
    // The weekend exemption must not leak into trading days.
    expect(hasCoverage(coverage, 'macro', '2026-09-11')).toBe(false); // Friday
  });
});

describe('dayRisks', () => {
  const weights = new Map([['AAPL', 0.25], ['MSFT', 0.1]]);

  it('sums exposure across holdings reporting the same day', () => {
    const out = dayRisks([
      ev({ id: 'a', date: '2026-08-10', symbol: 'AAPL' }),
      ev({ id: 'b', date: '2026-08-10', symbol: 'MSFT' }),
    ], weights);
    expect(out).toHaveLength(1);
    expect(out[0]!.exposure).toBeCloseTo(0.35, 10);
    expect(out[0]!.symbols).toEqual(['AAPL', 'MSFT']);
  });

  it('ignores symbols that are not held', () => {
    const out = dayRisks([ev({ id: 'a', date: '2026-08-10', symbol: 'NVDA' })], weights);
    expect(out).toEqual([]);
  });

  it('counts a symbol once even with two events that day', () => {
    // Double-counting would overstate exposure until the number gets ignored.
    const out = dayRisks([
      ev({ id: 'a', date: '2026-08-10', symbol: 'AAPL' }),
      ev({ id: 'b', date: '2026-08-10', symbol: 'AAPL', kind: 'custom', title: 'Investor day' }),
    ], weights);
    expect(out[0]!.exposure).toBeCloseTo(0.25, 10);
    expect(out[0]!.events).toHaveLength(2);
  });

  it('excludes ex-dividend dates — those are not position risk', () => {
    const out = dayRisks([ev({ id: 'a', date: '2026-08-10', symbol: 'AAPL', kind: 'dividend' })], weights);
    expect(out).toEqual([]);
  });

  it('is case-insensitive on symbols', () => {
    const out = dayRisks([ev({ id: 'a', date: '2026-08-10', symbol: 'aapl' })], weights);
    expect(out[0]!.exposure).toBeCloseTo(0.25, 10);
  });
});
