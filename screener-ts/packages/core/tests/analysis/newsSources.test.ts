import { describe, expect, it } from 'vitest';
import { mergeNews, parseFinnhubNews, parseGoogleNewsRss } from '../../src/analysis/newsSources.js';

describe('news sources', () => {
  it('reads Finnhub company news and drops rows with no date, title or link', () => {
    const r = parseFinnhubNews([
      { datetime: 1756300000, headline: 'Nvidia beats', source: 'Reuters', url: 'https://r.com/a', summary: '<b>Q2</b> revenue' },
      { datetime: 0, headline: 'x', url: 'https://r.com/b' },
      { datetime: 1756300000, headline: '', url: 'https://r.com/c' },
    ]);
    expect(r).toEqual([{ date: '2025-08-27', title: 'Nvidia beats', source: 'Reuters', url: 'https://r.com/a', summary: 'Q2 revenue', provider: 'finnhub' }]);
  });

  it('reads Google News RSS, splitting the publisher off the title', () => {
    const xml = `<rss><channel><item><title><![CDATA[Nvidia unveils Rubin &amp; more - The Verge]]></title>
      <link>https://news.google.com/x</link><pubDate>Tue, 09 Sep 2025 17:00:00 GMT</pubDate><source url="https://v.com">The Verge</source></item>
      <item><title>bad</title><link>nope</link><pubDate>x</pubDate></item></channel></rss>`;
    expect(parseGoogleNewsRss(xml)).toEqual([
      { date: '2025-09-09', title: 'Nvidia unveils Rubin & more', source: 'The Verge', url: 'https://news.google.com/x', summary: '', provider: 'google' },
    ]);
  });

  it('merges providers inside the window, de-duplicated, in date order, capped evenly', () => {
    const a = { date: '2025-09-09', title: 'Nvidia unveils Rubin', source: 'A', url: 'https://a', summary: '', provider: 'google' as const };
    const b = { ...a, summary: 'with summary', provider: 'finnhub' as const };
    const c = { ...a, date: '2025-08-01', title: 'Older' };
    const d = { ...a, date: '2024-01-01', title: 'Outside' };
    const m = mergeNews([[a, d], [b, c]], '2025-07-01', '2025-10-01');
    expect(m.map((n) => n.title)).toEqual(['Older', 'Nvidia unveils Rubin']);
    expect(m[1]!.summary).toBe('with summary');
    const many = Array.from({ length: 100 }, (_, i) => ({ ...a, date: `2025-08-${String((i % 28) + 1).padStart(2, '0')}`, title: `t${i}` }));
    expect(mergeNews([many], '2025-07-01', '2025-10-01', 10)).toHaveLength(10);
  });
});
