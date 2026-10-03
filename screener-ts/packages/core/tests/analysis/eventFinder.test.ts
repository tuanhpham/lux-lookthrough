import { describe, expect, it } from 'vitest';
import { buildEventFinderPrompt, parseEventFinderAnswer } from '../../src/analysis/eventFinder.js';

describe('event finder', () => {
  it('asks for the window around the date, the known dates and a single JSON block', () => {
    const p = buildEventFinderPrompt({ symbol: 'nvda', date: '2026-03-10', known: [{ date: '2026-02-25', text: 'Earnings' }, { date: '2025-01-01', text: 'old' }] }, 'vi');
    expect(p).toContain('NVDA between 2026-01-09 and 2026-04-09');
    expect(p).toContain('2026-02-25 Earnings');
    expect(p).not.toContain('2025-01-01');
    expect(p).toContain('```json');
    expect(p).toContain('Vietnamese');
  });

  it('keeps good rows, drops undated or malformed ones, de-duplicates and sorts', () => {
    const text = 'Here you go:\n```json\n' + JSON.stringify({
      events: [
        { date: '2026-03-01', kind: 'analyst', title: 'Upgrade to Buy', detail: 'PT 250', source: 'https://x.com/a' },
        { date: '2026-02-25', kind: 'earnings', title: 'Q4 beat', detail: 'EPS +12%', source: 'javascript:alert(1)' },
        { date: 'March', kind: 'news', title: 'no date' },
        { date: '2026-03-01', kind: 'analyst', title: 'upgrade to buy' },
        { date: '2026-03-05', kind: 'weird', title: 'Unknown kind' },
      ],
      note: { summary: 'Tight base', metrics: [{ label: 'Vol', value: '2.1×' }, { label: '', value: 'x' }], risks: ['Gap risk'] },
    }) + '\n```';
    const r = parseEventFinderAnswer(text)!;
    expect(r.events.map((e) => e.date)).toEqual(['2026-02-25', '2026-03-01', '2026-03-05']);
    expect(r.events[0]!.source).toBe('');
    expect(r.events[2]!.kind).toBe('other');
    expect(r.note).toEqual({ summary: 'Tight base', metrics: [{ label: 'Vol', value: '2.1×' }], risks: ['Gap risk'] });
  });

  it('is null when there is no JSON to read', () => {
    expect(parseEventFinderAnswer('Sorry, I could not search.')).toBeNull();
    expect(parseEventFinderAnswer('```json\n{broken\n```')).toBeNull();
  });
});
