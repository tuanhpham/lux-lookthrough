import { describe, expect, it } from 'vitest';
import { catalystOf, mergeCatalysts, noteHtmlOf } from '../src/caseStudies/eventNotes.js';

const ev = { date: '2026-02-25', kind: 'earnings' as const, title: 'Q4 <beat>', detail: 'EPS +12%', source: 'https://x.com/a' };

describe('event finder → catalysts and note', () => {
  it('turns a picked event into an escaped, tagged catalyst with its source', () => {
    const c = catalystOf(ev, true);
    expect(c).toMatchObject({ date: '2026-02-25', kind: 'earnings', source: 'https://x.com/a' });
    expect(c.text).toContain('[KQKD]');
    expect(c.text).toContain('<b>Q4 &lt;beat&gt;</b> — EPS +12%');
    expect(c.text).toContain('<a href="https://x.com/a">nguồn</a>');
  });

  it('merges without repeating an event already saved, and keeps date order', () => {
    const have = [{ date: '2026-03-01', text: '<b>Upgrade</b>' }, catalystOf(ev, false)];
    const add = [catalystOf({ ...ev, source: '' }, true), { date: '2026-01-10', text: 'CES keynote' }];
    const out = mergeCatalysts(have, add);
    expect(out.map((c) => c.date)).toEqual(['2026-01-10', '2026-02-25', '2026-03-01']);
  });

  it('builds a note from headings and lists only — nothing the sanitiser would strip', () => {
    const html = noteHtmlOf({
      symbol: 'nvda', date: '2026-03-10', vi: false, foundOn: '2026-10-03', picked: [ev],
      note: { summary: 'Tight base', metrics: [{ label: 'Volume', value: '2.1× avg' }], risks: ['Gap risk'] },
    });
    expect(html).toContain('<h4>📅 NVDA');
    expect(html).toContain('<li><b>Volume:</b> 2.1× avg</li>');
    expect(html).not.toMatch(/<table|<code/);
  });
});
