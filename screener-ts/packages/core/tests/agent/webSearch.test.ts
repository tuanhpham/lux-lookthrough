import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  decodeEntities,
  isDdgChallenge,
  parseDdgHtml,
  parseYahooNews,
} from '../../src/agent/webSearch.js';

const here = dirname(fileURLToPath(import.meta.url));
// Two organic results cut from a real DuckDuckGo POST response (2026-09-30), plus an
// ad block and a redirect-wrapped link written in the markup DuckDuckGo also serves.
const page = readFileSync(join(here, '..', 'fixtures', 'ddg-results.html'), 'utf8');

describe('parseDdgHtml', () => {
  const rows = parseDdgHtml(page);

  it('reads the organic results in page order and skips the ad', () => {
    expect(rows.map((r) => r.url)).toEqual([
      'https://investor.nvidia.com/financial-info/quarterly-results/default.aspx',
      'https://www.marketbeat.com/stocks/NASDAQ/NVDA/earnings/',
      'https://www.reuters.com/nvda?a=1&b=2',
    ]);
    expect(rows.some((r) => r.title.includes('Trade NVDA Now'))).toBe(false);
  });

  it('pairs each snippet with its own title', () => {
    expect(rows[1]!.title).toBe('NVIDIA (NVDA) Earnings Date and Reports 2026 - MarketBeat');
    expect(rows[1]!.snippet).toMatch(/^When is NVIDIA's next earnings announcement\?/);
  });

  it('unwraps the uddg redirect and strips tags and entities', () => {
    const r = rows[2]!;
    expect(r.title).toBe('Nvidia & the AI trade');
    expect(r.snippet).toBe('It\'s up 5% "today"');
  });

  it('honours the limit', () => {
    expect(parseDdgHtml(page, 1)).toHaveLength(1);
  });

  it('returns nothing, not a throw, for markup it does not know', () => {
    expect(parseDdgHtml('<html><body>changed layout</body></html>')).toEqual([]);
    expect(parseDdgHtml('')).toEqual([]);
  });

  it('drops links that are not http(s)', () => {
    const html = '<div class="result"><a class="result__a" href="javascript:alert(1)">x</a></div>';
    expect(parseDdgHtml(html)).toEqual([]);
  });
});

describe('isDdgChallenge', () => {
  it('tells the bot check apart from a results page', () => {
    const challenge =
      '<html><form id="challenge-form" action="//duckduckgo.com/anomaly.js?sv=html"></form></html>';
    expect(isDdgChallenge(challenge)).toBe(true);
    expect(isDdgChallenge(page)).toBe(false);
    // An empty result page is an answer, not a block.
    expect(isDdgChallenge('<html><div class="no-results">No results.</div></html>')).toBe(false);
  });
});

describe('parseYahooNews', () => {
  const json = {
    news: [
      { title: 'Older', publisher: 'Reuters', link: 'https://r.example/a', providerPublishTime: 1790000000, relatedTickers: ['NVDA'] },
      { title: 'Newer &amp; better', publisher: 'Barron&#39;s', link: 'https://b.example/b', providerPublishTime: 1790700000 },
      { title: 'No link' },
      { title: 'Bad link', link: 'ftp://x' },
    ],
  };

  it('keeps well-formed items, newest first, with a UTC date', () => {
    const rows = parseYahooNews(json);
    expect(rows.map((r) => r.title)).toEqual(['Newer & better', 'Older']);
    expect(rows[0]!.publisher).toBe("Barron's");
    expect(rows[1]).toEqual({
      title: 'Older',
      publisher: 'Reuters',
      url: 'https://r.example/a',
      date: new Date(1790000000 * 1000).toISOString().slice(0, 10),
      tickers: ['NVDA'],
    });
  });

  it('survives shapes it was not promised', () => {
    expect(parseYahooNews(null)).toEqual([]);
    expect(parseYahooNews({ news: 'x' })).toEqual([]);
    expect(parseYahooNews(json, 1)).toHaveLength(1);
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities and leaves unknown ones', () => {
    expect(decodeEntities('a &amp; b &#39;c&#x27; &bogus;')).toBe("a & b 'c' &bogus;");
  });
});
