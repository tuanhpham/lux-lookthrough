import { describe, it, expect } from 'vitest';
import {
  rankAttention,
  eventsBySymbol,
  DEFAULT_ATTENTION_CONFIG,
} from '../../src/catalysts/attention.js';
import type { AttentionInput } from '../../src/catalysts/attention.js';
import type { CatalystEvent } from '../../src/catalysts/types.js';

const TODAY = '2026-08-07';

function ev(over: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: `earnings:X:${over.date ?? TODAY}`,
    kind: 'earnings',
    date: TODAY,
    timing: 'amc',
    confidence: 'confirmed',
    symbol: 'X',
    title: 'X Corp',
    impact: 80,
    source: 'nasdaq',
    ...over,
  };
}

/** A symbol with no signals at all — the baseline every term is measured against. */
function bare(symbol: string, over: Partial<AttentionInput> = {}): AttentionInput {
  return { symbol, events: [], ...over };
}

describe('rankAttention', () => {
  it('ranks a catalyst meeting a setup above either signal alone', () => {
    // The whole premise of the module: impact alone is the earnings calendar,
    // quality alone is the screener. The combination is the thing worth surfacing.
    const rows = rankAttention(
      [
        bare('BOTH', {
          events: [ev({ symbol: 'BOTH', date: '2026-08-10', impact: 85 })],
          qualityScore: 85,
          distanceToPivotPct: 2,
          momentumScore: 80,
        }),
        bare('EVENTONLY', {
          events: [ev({ symbol: 'EVENTONLY', date: '2026-08-10', impact: 85 })],
        }),
        bare('SETUPONLY', {
          qualityScore: 85,
          distanceToPivotPct: 2,
          momentumScore: 80,
        }),
      ],
      TODAY,
    );
    expect(rows[0]!.symbol).toBe('BOTH');
    // The score is additive by design, so the combination collects both sets of
    // terms and neither one-sided row can reach it. Which of the two one-sided
    // rows places second is a weighting choice, not a claim — so it is not pinned
    // here; only "both beats either" is.
    const by = new Map(rows.map((r) => [r.symbol, r.score]));
    expect(by.get('BOTH')!).toBeGreaterThan(by.get('EVENTONLY')!);
    expect(by.get('BOTH')!).toBeGreaterThan(by.get('SETUPONLY')!);
  });

  it('ranks a symbol with only events, rather than dropping it for having no scan', () => {
    // A held position reporting tomorrow must appear even when no scan ran for it.
    const rows = rankAttention([bare('NOSCAN', { events: [ev({ symbol: 'NOSCAN' })] })], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qualityScore).toBeNull();
    expect(rows[0]!.score).toBeGreaterThan(0);
  });

  it('puts a held position above an identical unheld one', () => {
    // You cannot opt out of an event in a stock you own; a watchlist name you can
    // simply skip. So ownership has to be a scoring term, not a badge.
    const shared = { events: [ev({ date: '2026-08-12' })], qualityScore: 70 };
    const rows = rankAttention(
      [
        bare('FREE', shared),
        bare('WATCH', { ...shared, watchlisted: true }),
        bare('HELD', { ...shared, weight: 0.15 }),
      ],
      TODAY,
    );
    expect(rows.map((r) => r.symbol)).toEqual(['HELD', 'WATCH', 'FREE']);
  });

  it('scales the held term with position size', () => {
    const shared = { events: [ev({ date: '2026-08-12' })] };
    const rows = rankAttention(
      [bare('SMALL', { ...shared, weight: 0.01 }), bare('BIG', { ...shared, weight: 0.25 })],
      TODAY,
    );
    expect(rows[0]!.symbol).toBe('BIG');
    // A 1% position still earns real credit — it is held, and the event still hits it.
    expect(rows[1]!.score).toBeGreaterThan(0);
  });

  it('decays imminence on a ramp rather than a cliff', () => {
    // With a "this week" flag, everything 8+ days out scores identically and the
    // whole list churns every Monday. A ramp keeps next week's prints ranked.
    const scoreAt = (date: string): number =>
      rankAttention([bare('A', { events: [ev({ date })] })], TODAY)[0]!.score;
    const d0 = scoreAt('2026-08-07');
    const d5 = scoreAt('2026-08-12');
    const d10 = scoreAt('2026-08-17');
    const d20 = scoreAt('2026-08-27');
    expect(d0).toBeGreaterThan(d5);
    expect(d5).toBeGreaterThan(d10);
    expect(d10).toBeGreaterThan(d20);
    // And no step is a cliff: consecutive gaps stay in the same order of magnitude.
    expect(d5 - d10).toBeLessThan((d0 - d5) * 4);
  });

  it('gives zero imminence credit beyond the horizon instead of going negative', () => {
    const far = rankAttention(
      [bare('A', { events: [ev({ date: '2027-01-01' })] })],
      TODAY,
    )[0]!;
    const none = rankAttention([bare('B', { events: [] })], TODAY)[0]!;
    // Impact still counts (the event exists), but timing adds nothing — it must not
    // subtract, or a distant catalyst would rank below having no catalyst at all.
    expect(far.score).toBeGreaterThanOrEqual(none.score);
    expect(far.daysAway).toBeGreaterThan(DEFAULT_ATTENTION_CONFIG.horizonDays);
  });

  it('ignores events dated before today', () => {
    // A stale row at the top of an "attention" list destroys trust in the panel.
    const r = rankAttention(
      [
        bare('A', {
          events: [ev({ date: '2026-07-01' }), ev({ date: '2026-08-20', impact: 60 })],
        }),
      ],
      TODAY,
    )[0]!;
    expect(r.eventCount).toBe(1);
    expect(r.nextEvent!.date).toBe('2026-08-20');
    expect(r.daysAway).toBe(13);
  });

  it('ranks on technicals alone when every event is in the past', () => {
    const r = rankAttention(
      [bare('A', { events: [ev({ date: '2026-01-01' })], qualityScore: 90 })],
      TODAY,
    )[0]!;
    expect(r.nextEvent).toBeNull();
    expect(r.daysAway).toBeNull();
    expect(r.eventCount).toBe(0);
    expect(r.score).toBeGreaterThan(0);
  });

  it('picks the soonest event, breaking same-day ties by impact', () => {
    const r = rankAttention(
      [
        bare('A', {
          events: [
            ev({ id: 'a', date: '2026-08-15', impact: 40, title: 'later' }),
            ev({ id: 'b', date: '2026-08-10', impact: 30, title: 'low' }),
            ev({ id: 'c', date: '2026-08-10', impact: 90, title: 'high' }),
          ],
        }),
      ],
      TODAY,
    )[0]!;
    expect(r.nextEvent!.title).toBe('high');
    // Peak impact across the window drives the impact term, not just the next one.
    expect(r.reasons).toContain('high-impact');
    expect(r.reasons).toContain('multi-event');
  });

  it('tags reasons as machine-readable codes, strongest first', () => {
    // Deliberately not prose: the module stays language-free and the UI localizes.
    const r = rankAttention(
      [
        bare('A', {
          events: [ev({ date: '2026-08-10', impact: 90, confidence: 'estimated' })],
          qualityScore: 80,
          momentumScore: 75,
          distanceToPivotPct: 1.5,
          weight: 0.1,
        }),
      ],
      TODAY,
    )[0]!;
    expect(r.reasons).toEqual([
      'held',
      'earnings-soon',
      'high-impact',
      'strong-setup',
      'near-pivot',
      'strong-momentum',
      'unconfirmed-date',
    ]);
  });

  it('never tags both held and watchlist', () => {
    // Held strictly implies you care; showing both is noise in a chip row.
    const r = rankAttention(
      [bare('A', { events: [ev()], weight: 0.1, watchlisted: true })],
      TODAY,
    )[0]!;
    expect(r.reasons).toContain('held');
    expect(r.reasons).not.toContain('watchlist');
  });

  it('flags a non-earnings catalyst as event-soon, not earnings-soon', () => {
    const r = rankAttention(
      [bare('A', { events: [ev({ kind: 'lockup', date: '2026-08-09' })] })],
      TODAY,
    )[0]!;
    expect(r.reasons).toContain('event-soon');
    expect(r.reasons).not.toContain('earnings-soon');
  });

  it('always surfaces an estimated date', () => {
    // The difference between preparing for a print and being surprised by one.
    const r = rankAttention(
      [bare('A', { events: [ev({ date: '2026-08-25', confidence: 'estimated' })] })],
      TODAY,
    )[0]!;
    expect(r.reasons).toContain('unconfirmed-date');
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      bare(`S${i}`, { events: [ev({ date: '2026-08-10' })], qualityScore: i * 3 }),
    );
    expect(rankAttention(many, TODAY)).toHaveLength(7); // default Top 7
    expect(rankAttention(many, TODAY, 3)).toHaveLength(3);
    // And it keeps the BEST rows, not the first ones seen.
    expect(rankAttention(many, TODAY, 3)[0]!.symbol).toBe('S29');
  });

  it('orders ties deterministically so the panel does not reshuffle on repaint', () => {
    const inputs = [bare('ZZZ'), bare('AAA'), bare('MMM')];
    const first = rankAttention(inputs, TODAY).map((r) => r.symbol);
    const again = rankAttention([...inputs].reverse(), TODAY).map((r) => r.symbol);
    expect(first).toEqual(['AAA', 'MMM', 'ZZZ']);
    expect(again).toEqual(first);
  });

  it('breaks equal scores by the sooner event before the symbol', () => {
    const rows = rankAttention(
      [
        bare('ZED', { events: [ev({ date: '2026-08-08' })] }),
        bare('ABE', { events: [ev({ date: '2026-08-08' })] }),
      ],
      TODAY,
    );
    // Same score, same date → alphabetical.
    expect(rows.map((r) => r.symbol)).toEqual(['ABE', 'ZED']);
  });

  it('keeps every score inside 0..100', () => {
    const maxed = rankAttention(
      [
        bare('MAX', {
          events: [ev({ impact: 100 }), ev({ id: 'b', impact: 100, date: '2026-08-08' })],
          qualityScore: 100,
          momentumScore: 100,
          distanceToPivotPct: -5, // already above the pivot
          weight: 1,
        }),
      ],
      TODAY,
    )[0]!;
    expect(maxed.score).toBeLessThanOrEqual(100);
    const empty = rankAttention([bare('MIN')], TODAY)[0]!;
    expect(empty.score).toBe(0);
  });

  it('treats a missing pivot distance as no credit rather than a guess', () => {
    const withPivot = rankAttention([bare('A', { distanceToPivotPct: 0 })], TODAY)[0]!;
    const noPivot = rankAttention([bare('B', {})], TODAY)[0]!;
    expect(withPivot.score).toBeGreaterThan(noPivot.score);
    expect(noPivot.distanceToPivotPct).toBeNull();
  });

  it('normalizes symbols to upper case', () => {
    expect(rankAttention([bare('nvda')], TODAY)[0]!.symbol).toBe('NVDA');
  });

  it('honours a custom config', () => {
    const tight = { ...DEFAULT_ATTENTION_CONFIG, horizonDays: 5 };
    const input = [bare('A', { events: [ev({ date: '2026-08-20' })] })];
    // 13 days out is inside the default horizon but past a 5-day one.
    expect(rankAttention(input, TODAY, 7, tight)[0]!.score).toBeLessThan(
      rankAttention(input, TODAY)[0]!.score,
    );
  });

  it('returns an empty list for no inputs', () => {
    expect(rankAttention([], TODAY)).toEqual([]);
  });
});

describe('eventsBySymbol', () => {
  it('groups by upper-cased symbol', () => {
    const map = eventsBySymbol([
      ev({ symbol: 'aapl', id: '1' }),
      ev({ symbol: 'AAPL', id: '2' }),
      ev({ symbol: 'MSFT', id: '3' }),
    ]);
    expect([...map.keys()].sort()).toEqual(['AAPL', 'MSFT']);
    expect(map.get('AAPL')).toHaveLength(2);
  });

  it('drops market-wide events', () => {
    // A macro print applies to everything, so it cannot distinguish one stock from
    // another — including it would just add a constant to every row.
    const map = eventsBySymbol([
      ev({ symbol: null, kind: 'macro', id: 'cpi' }),
      ev({ symbol: 'AAPL', id: '1' }),
    ]);
    expect([...map.keys()]).toEqual(['AAPL']);
  });

  it('returns an empty map for no events', () => {
    expect(eventsBySymbol([]).size).toBe(0);
  });
});
