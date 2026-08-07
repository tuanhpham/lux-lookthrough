import { describe, it, expect } from 'vitest';
import { derivedEvents, nthWeekday, lastWeekday, dayOfWeek } from '../../src/catalysts/derived.js';

/** Cross-check the hand-rolled weekday math against the platform Date (in UTC,
 * which is what the helpers claim to compute). */
function utcDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

describe('calendar math', () => {
  it('dayOfWeek matches Date across a year of month starts', () => {
    for (let m = 1; m <= 12; m++) {
      expect(dayOfWeek(2026, m, 1)).toBe(utcDow(`2026-${String(m).padStart(2, '0')}-01`));
    }
  });

  it('handles the Jan/Feb Zeller shift and a leap year', () => {
    expect(dayOfWeek(2028, 1, 1)).toBe(utcDow('2028-01-01'));
    expect(dayOfWeek(2028, 2, 29)).toBe(utcDow('2028-02-29'));
    expect(dayOfWeek(2028, 3, 1)).toBe(utcDow('2028-03-01'));
  });

  it('finds the 3rd Friday', () => {
    // Verified: 2026-08-21 and 2026-09-18 are third Fridays.
    expect(nthWeekday(2026, 8, 5, 3)).toBe('2026-08-21');
    expect(nthWeekday(2026, 9, 5, 3)).toBe('2026-09-18');
    expect(utcDow(nthWeekday(2026, 8, 5, 3))).toBe(5);
  });

  it('finds the last Friday of June', () => {
    expect(utcDow(lastWeekday(2026, 6, 5))).toBe(5);
    expect(lastWeekday(2026, 6, 5)).toBe('2026-06-26');
  });
});

describe('derivedEvents', () => {
  const win = { from: '2026-08-07', to: '2026-09-07' };
  const events = derivedEvents(win.from, win.to);

  it('stays strictly inside the window', () => {
    expect(events.every((e) => e.date >= win.from && e.date <= win.to)).toBe(true);
  });

  it('includes the August CPI print and monthly opex', () => {
    expect(events.find((e) => e.title === 'CPI inflation report')?.date).toBe('2026-08-12');
    const opex = events.find((e) => e.kind === 'expiry');
    expect(opex?.date).toBe('2026-08-21');
    expect(opex?.title).toBe('Monthly options expiry');
  });

  it('covers the full 30 days — unlike the econ API, these never run dry', () => {
    // The Nasdaq econ feed is empty past ~3 weeks; a Sep 4 NFP must still appear.
    expect(events.some((e) => e.date === '2026-09-04' && /payrolls/i.test(e.title))).toBe(true);
  });

  it('marks FOMC confirmed but the NFP rule only derived', () => {
    const fomc = derivedEvents('2026-09-01', '2026-09-30').find((e) => /FOMC/.test(e.title));
    expect(fomc?.date).toBe('2026-09-16');
    expect(fomc?.confidence).toBe('confirmed');
    expect(events.find((e) => /payrolls/i.test(e.title))?.confidence).toBe('derived');
  });

  it('adds triple witching + S&P rebalance only in quarter-end months', () => {
    const sep = derivedEvents('2026-09-01', '2026-09-30');
    expect(sep.find((e) => e.kind === 'expiry')?.title).toBe('Triple witching');
    expect(sep.some((e) => e.kind === 'rebalance' && /S&P/.test(e.title))).toBe(true);
    // August is not a quarter end.
    expect(events.some((e) => e.kind === 'rebalance')).toBe(false);
  });

  it('adds Russell reconstitution on the last Friday of June', () => {
    const jun = derivedEvents('2026-06-01', '2026-06-30');
    expect(jun.find((e) => /Russell/.test(e.title))?.date).toBe('2026-06-26');
  });

  it('emits unique ids', () => {
    const ids = derivedEvents('2026-01-01', '2026-12-31').map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves market-wide events unsymboled', () => {
    expect(events.every((e) => e.symbol === null)).toBe(true);
  });

  /* The hardcoded table must yield to the live econ feed, or a stale entry shows
   * up as a phantom print. Verified live: this table has CPI on 2026-08-12 while
   * the feed has it on 08-13 — both rendered, one of them wrong. */
  it('suppresses table macro events on days the live feed already covers', () => {
    const live = new Set(['2026-08-12', '2026-08-13']);
    const out = derivedEvents('2026-08-01', '2026-08-31', live);
    expect(out.find((e) => /CPI/.test(e.title))).toBeUndefined();
  });

  it('still fills macro days the feed has NO data for', () => {
    // Feed covers 08-12 but not the September FOMC — the table must supply it.
    const out = derivedEvents('2026-08-01', '2026-09-30', new Set(['2026-08-12']));
    expect(out.find((e) => /FOMC/.test(e.title))?.date).toBe('2026-09-16');
    // And the September CPI, which the ~3-week-horizon feed can't reach yet.
    expect(out.find((e) => /CPI/.test(e.title))?.date).toBe('2026-09-11');
  });

  it('fills INTERIOR feed holes, not just days past the horizon', () => {
    // Verified live: the feed answered for 2026-09-01 but returned null for
    // 08-31 and 09-02. A single cutoff date would leave those holes unfilled,
    // which is why this takes a set.
    const nfp = derivedEvents('2026-09-01', '2026-09-30', new Set(['2026-09-01', '2026-09-03']))
      .find((e) => /payrolls/.test(e.title));
    expect(nfp?.date).toBe('2026-09-04'); // first Friday, and the feed lacks it
  });

  it('never suppresses expiry/rebalance, which are pure date arithmetic', () => {
    const all = new Set(dateRangeish('2026-09-01', '2026-09-30'));
    const out = derivedEvents('2026-09-01', '2026-09-30', all);
    expect(out.find((e) => e.kind === 'expiry')?.date).toBe('2026-09-18');
    expect(out.some((e) => e.kind === 'rebalance')).toBe(true);
    expect(out.some((e) => e.kind === 'macro')).toBe(false);
  });
});

/** Local day-list helper so this test file stays independent of window.ts. */
function dateRangeish(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; ) {
    out.push(d);
    const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
    const next = new Date(Date.UTC(y, m - 1, dd + 1));
    d = next.toISOString().slice(0, 10);
  }
  return out;
}
