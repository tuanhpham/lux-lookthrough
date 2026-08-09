import { describe, it, expect } from 'vitest';
import {
  buildResearchPrompt,
  buildResearchPrompts,
  contextBlock,
  chatGptUrl,
  chatGptAskUrl,
  isCustomGptUrl,
  RESEARCH_PROMPT_IDS,
  DEFAULT_CHATGPT_URL,
  MAX_URL_PROMPT_LENGTH,
  MAX_FRAGMENT_PROMPT_LENGTH,
  AUTORUN_MARKER,
} from '../../src/analysis/researchPrompts.js';
import type { StockPromptContext } from '../../src/analysis/researchPrompts.js';

const FULL: StockPromptContext = {
  symbol: 'nvda',
  name: 'NVIDIA Corp',
  sector: 'Technology',
  industry: 'Semiconductors',
  price: 142.35,
  marketCap: 3.48e12,
  setupType: 'VCP',
  qualityScore: 84,
  pivot: 145.2,
  entryPrice: 145.5,
  stopLoss: 136.8,
  targetPrice: 168,
  distanceToPivotPct: 2.1,
  previousAdvancePct: 63.4,
  vcpContractions: 3,
  volumeContractionPct: 41.2,
  atrContractionPct: 38.9,
  baseDepthPct: 14.6,
  momentumScore: 78,
  relativeStrength: 12.4,
  return1mPct: 6.2,
  return3mPct: 21.8,
  return6mPct: 44.1,
  atrPct: 3.1,
  distanceFrom52wHighPct: 5.4,
  peRatio: 51.3,
  eps: 2.78,
  roe: 89.2,
  profitMargin: 55.1,
  revenueGrowthPct: 93.6,
  trendPassed: true,
  nextEventDate: '2026-08-27',
  nextEventTitle: 'Q2 FY27 earnings',
  nextEventKind: 'earnings',
  nextEventEstimated: false,
  marketRegime: 'BULL',
  today: '2026-08-07',
};

describe('contextBlock', () => {
  it('emits every field it was given', () => {
    const b = contextBlock(FULL);
    expect(b).toContain('Symbol: NVDA');
    expect(b).toContain('Company: NVIDIA Corp');
    expect(b).toContain('Sector / industry: Technology / Semiconductors');
    expect(b).toContain('Price: 142.35');
    expect(b).toContain('Market cap: $3.48T');
    expect(b).toContain('Pivot: 145.2');
    expect(b).toContain('Distance to pivot: 2.1%');
    expect(b).toContain('Entry / stop / target: 145.5 / 136.8 / 168');
    expect(b).toContain('Returns 1M / 3M / 6M: 6.2% / 21.8% / 44.1%');
    expect(b).toContain('Trend filter: passed');
    expect(b).toContain('Market regime: BULL');
  });

  it('omits absent fields entirely rather than emitting null or zero', () => {
    // THE CRITICAL PROPERTY. `Pivot: null` invites the model to fill the gap, and a
    // hallucinated pivot silently corrupts every trade level derived from it.
    const b = contextBlock({ symbol: 'AAPL', price: 210 });
    expect(b).toContain('Symbol: AAPL');
    expect(b).toContain('Price: 210');
    expect(b).not.toContain('Pivot');
    expect(b).not.toContain('null');
    expect(b).not.toContain('undefined');
    expect(b).not.toContain('NaN');
    expect(b).not.toContain('P/E');
    expect(b).not.toContain('Next catalyst');
  });

  it('tells the model that anything unlisted is unknown', () => {
    // Without this the omission above is silent, and the model treats a short block
    // as "nothing notable" instead of "I was not told".
    expect(contextBlock({ symbol: 'A' })).toContain('UNKNOWN');
    expect(contextBlock({ symbol: 'A' }, 'vi')).toContain('KHÔNG BIẾT');
  });

  it('drops non-finite numbers as if they were absent', () => {
    // NaN reaches here whenever an indicator had too little history; printing it
    // would be worse than omitting the line.
    const b = contextBlock({ symbol: 'A', price: NaN, qualityScore: Infinity, pivot: 12 });
    expect(b).not.toContain('Price');
    expect(b).not.toContain('Quality');
    expect(b).toContain('Pivot: 12');
  });

  it('labels an estimated catalyst date, always', () => {
    // Planning around an estimated date is a real way to lose money, so the label
    // is not optional.
    const est = contextBlock({ ...FULL, nextEventEstimated: true });
    expect(est).toContain('ESTIMATED date');
    expect(contextBlock({ ...FULL, nextEventEstimated: true }, 'vi')).toContain('DỰ KIẾN');
    expect(contextBlock(FULL)).not.toContain('ESTIMATED');
  });

  it('falls back to the event kind when the title is missing', () => {
    const b = contextBlock({ symbol: 'A', nextEventDate: '2026-09-01', nextEventKind: 'lockup' });
    expect(b).toContain('2026-09-01 — lockup');
  });

  it('shows a partial entry/stop/target row rather than hiding it', () => {
    // A stop with no target is still worth stating; the '?' makes the gap explicit.
    const b = contextBlock({ symbol: 'A', stopLoss: 90 });
    expect(b).toContain('Entry / stop / target: ? / 90 / ?');
  });

  it('marks a non-USD price with its currency', () => {
    expect(contextBlock({ symbol: 'A', price: 10, currency: 'EUR' })).toContain('Price: 10 EUR');
    expect(contextBlock({ symbol: 'A', price: 10, currency: 'USD' })).toContain('Price: 10\n');
  });

  it('formats market cap compactly across magnitudes', () => {
    const cap = (v: number): string => contextBlock({ symbol: 'A', marketCap: v });
    expect(cap(3.48e12)).toContain('$3.48T');
    expect(cap(2.1e9)).toContain('$2.1B');
    expect(cap(9.4e8)).toContain('$940M');
  });

  it('reports a failed trend filter as failed, not as absent', () => {
    // `false` is information; treating it like a missing field would hide the one
    // fact that most often invalidates the setup.
    expect(contextBlock({ symbol: 'A', trendPassed: false })).toContain('Trend filter: failed');
    expect(contextBlock({ symbol: 'A', trendPassed: false }, 'vi')).toContain('chưa đạt');
  });

  it('uses Vietnamese labels in the vi block', () => {
    const b = contextBlock(FULL, 'vi');
    expect(b).toContain('Mã: NVDA');
    expect(b).toContain('Giá: 142.35');
    expect(b).toContain('Vốn hóa: $3.48T');
    expect(b).not.toContain('Symbol:');
  });
});

describe('buildResearchPrompt', () => {
  it('builds all four prompts in a stable display order', () => {
    const prompts = buildResearchPrompts(FULL);
    expect(prompts.map((p) => p.id)).toEqual(RESEARCH_PROMPT_IDS);
    expect(RESEARCH_PROMPT_IDS).toEqual(['market', 'events', 'accumulation', 'fundamentals']);
  });

  it('gives every prompt a title, a goal and a body with the context appended', () => {
    for (const p of buildResearchPrompts(FULL)) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.goal.length).toBeGreaterThan(0);
      expect(p.body).toContain('Stock under review: NVDA (NVIDIA Corp)');
      expect(p.body).toContain('MEASURED DATA');
      expect(p.body).toContain('Pivot: 145.2');
    }
  });

  it('ends every prompt by asking what would disprove it', () => {
    // The failure mode of this feature is a confident narrative that agrees with
    // whatever the user already wanted to do. Naming the falsifier is the guard.
    for (const p of buildResearchPrompts(FULL)) {
      expect(p.body).toContain('What would prove me wrong:');
      expect(p.body).toContain('could NOT verify');
    }
    for (const p of buildResearchPrompts(FULL, 'vi')) {
      expect(p.body).toContain('Điều sẽ chứng minh tôi sai:');
    }
  });

  it('asks the model to date its own claims instead of asserting recency', () => {
    // The model's cutoff is unknown here, so "use the latest data" would be a lie
    // the output then inherits.
    for (const p of buildResearchPrompts(FULL)) {
      expect(p.body).toContain('as-of date');
    }
  });

  it('refuses to ask for a buy/sell call', () => {
    for (const p of buildResearchPrompts(FULL)) {
      expect(p.body).toContain('Do not give a buy/sell recommendation');
    }
  });

  it('produces four materially different prompts', () => {
    const bodies = buildResearchPrompts(FULL).map((p) => p.body);
    expect(new Set(bodies).size).toBe(4);
    const [market, events, accumulation, fundamentals] = bodies as [string, string, string, string];
    expect(market).toContain('regime');
    expect(events).toContain('catalysts');
    expect(accumulation).toContain('distribution');
    expect(fundamentals).toContain('bear case');
  });

  it('localizes titles, goals and bodies', () => {
    const en = buildResearchPrompt('accumulation', FULL, 'en');
    const vi = buildResearchPrompt('accumulation', FULL, 'vi');
    expect(en.title).not.toBe(vi.title);
    expect(en.goal).not.toBe(vi.goal);
    expect(vi.body).toContain('Cổ phiếu đang xem xét');
    expect(vi.body).toContain('phân phối');
  });

  it('defaults to English', () => {
    expect(buildResearchPrompt('market', FULL).body).toBe(
      buildResearchPrompt('market', FULL, 'en').body,
    );
  });

  it('works from a symbol alone', () => {
    // The modal opens before any scan finishes; a prompt must still be copyable.
    const p = buildResearchPrompt('fundamentals', { symbol: 'TSLA' });
    // No name → no empty "()" in the heading.
    expect(p.body.split('\n')[0]).toBe('Stock under review: TSLA.');
    expect(p.body).toContain('UNKNOWN');
  });

  it('upper-cases the symbol in the heading', () => {
    expect(buildResearchPrompt('market', { symbol: 'amd' }).body).toContain(
      'Stock under review: AMD',
    );
  });
});

describe('chatGptUrl', () => {
  it('defaults to the plain chat page when nothing is configured', () => {
    expect(chatGptUrl()).toBe(DEFAULT_CHATGPT_URL);
    expect(chatGptUrl(null)).toBe(DEFAULT_CHATGPT_URL);
    expect(chatGptUrl('')).toBe(DEFAULT_CHATGPT_URL);
    expect(chatGptUrl('   ')).toBe(DEFAULT_CHATGPT_URL);
  });

  it('accepts a custom GPT link on a ChatGPT host', () => {
    const u = 'https://chatgpt.com/g/g-abc123-my-trading-gpt';
    expect(chatGptUrl(u)).toBe(u);
    expect(chatGptUrl(`  ${u}  `)).toBe(u);
    expect(chatGptUrl('https://chat.openai.com/g/g-abc123')).toBe(
      'https://chat.openai.com/g/g-abc123',
    );
  });

  it('rejects a javascript: URL', () => {
    // THE REASON THIS FUNCTION EXISTS. This value arrives from storage and can be
    // written by any synced device; building an href from it unchecked ships a
    // stored XSS.
    expect(chatGptUrl('javascript:alert(document.cookie)')).toBe(DEFAULT_CHATGPT_URL);
    expect(chatGptUrl('JavaScript:alert(1)')).toBe(DEFAULT_CHATGPT_URL);
    expect(chatGptUrl('data:text/html,<script>alert(1)</script>')).toBe(DEFAULT_CHATGPT_URL);
  });

  it('rejects http, even on the right host', () => {
    // The prompt can contain position sizes and price levels; it does not travel
    // over plaintext.
    expect(chatGptUrl('http://chatgpt.com/g/g-abc')).toBe(DEFAULT_CHATGPT_URL);
  });

  it('rejects a look-alike host', () => {
    // `chatgpt.com.evil.io` and `evil-chatgpt.com` both pass a naive substring check.
    expect(chatGptUrl('https://chatgpt.com.evil.io/g/g-abc')).toBe(DEFAULT_CHATGPT_URL);
    expect(chatGptUrl('https://evil-chatgpt.com/')).toBe(DEFAULT_CHATGPT_URL);
    expect(chatGptUrl('https://notchatgpt.com/g/x')).toBe(DEFAULT_CHATGPT_URL);
  });

  it('rejects an unparseable string', () => {
    expect(chatGptUrl('not a url')).toBe(DEFAULT_CHATGPT_URL);
    expect(chatGptUrl('chatgpt.com/g/g-abc')).toBe(DEFAULT_CHATGPT_URL); // no scheme
  });

  it('is case-insensitive about the host', () => {
    expect(chatGptUrl('https://ChatGPT.com/g/g-abc')).toBe('https://chatgpt.com/g/g-abc');
  });
});

describe('chatGptAskUrl', () => {
  it('puts the prompt in the q parameter so the composer is pre-filled', () => {
    const { url, embedded } = chatGptAskUrl('analyse NVDA');
    expect(embedded).toBe(true);
    expect(url).toBe('https://chatgpt.com/?q=analyse%20NVDA');
  });

  it('appends q to a custom GPT link, keeping the GPT path intact', () => {
    // The whole point: the question must land inside the user's OWN GPT, not in a
    // fresh default chat that knows none of its instructions.
    const { url } = chatGptAskUrl('hello', 'https://chatgpt.com/g/g-abc123-my-trader');
    expect(url).toBe('https://chatgpt.com/g/g-abc123-my-trader?q=hello');
  });

  it('uses & when the configured link already carries a query', () => {
    // A second '?' makes the whole query string unparseable, so the prompt would
    // arrive as part of the previous parameter's value — or not at all.
    const { url } = chatGptAskUrl('hi', 'https://chatgpt.com/g/g-abc?model=gpt-5');
    expect(url).toBe('https://chatgpt.com/g/g-abc?model=gpt-5&q=hi');
  });

  it('encodes characters that would otherwise break the URL', () => {
    const { url } = chatGptAskUrl('a&b=c?d #e\nf');
    // Raw '&' would split the parameter; raw '#' would truncate everything after
    // it into a fragment the server never sees.
    expect(url).not.toContain('&b');
    expect(url).not.toContain('#e');
    expect(url).toContain('%26b');
    expect(url).toContain('%23e');
    expect(url).toContain('%0A');
  });

  it('round-trips the prompt exactly', () => {
    // Vietnamese diacritics are the case that actually exercises the encoding.
    const p = 'Phân tích cổ phiếu NVDA — pivot 145.2, "đã tích lũy" 3 lần?';
    const { url } = chatGptAskUrl(p);
    expect(decodeURIComponent(url.split('?q=')[1]!)).toBe(p);
  });

  it('refuses to put a prompt too long to survive the trip in the query', () => {
    // A TRUNCATED prompt is the worst outcome: the model answers a question that
    // silently lost its tail, which is exactly where "state what would disprove
    // this" lives. Better to open a clean composer and let the paste happen.
    const huge = 'x'.repeat(MAX_URL_PROMPT_LENGTH + 1);
    const { url, embedded } = chatGptAskUrl(huge, 'https://chatgpt.com/g/g-abc');
    expect(embedded).toBe(false);
    expect(url).toBe('https://chatgpt.com/g/g-abc');
    expect(url).not.toContain('q=');
  });

  it('measures the cap against the ENCODED length, not the raw one', () => {
    // Percent-encoding inflates non-ASCII roughly 3x, so a raw length check would
    // pass a Vietnamese prompt that is actually 3x over the limit.
    const raw = 'ữ'.repeat(3000); // 3000 chars raw, ~27000 encoded
    expect(raw.length).toBeLessThan(MAX_URL_PROMPT_LENGTH);
    expect(chatGptAskUrl(raw).embedded).toBe(false);
  });

  it('accepts a real prompt at full length', () => {
    // Guards the cap against being set below what this app actually produces.
    for (const lang of ['en', 'vi'] as const) {
      for (const p of buildResearchPrompts(FULL, lang)) {
        expect(chatGptAskUrl(p.body).embedded).toBe(true);
      }
    }
  });

  it('still refuses a hostile configured URL', () => {
    // chatGptAskUrl must not become a way around chatGptUrl's host whitelist.
    const { url } = chatGptAskUrl('hi', 'javascript:alert(1)');
    expect(url).toBe(`${DEFAULT_CHATGPT_URL}?q=hi`);
    expect(chatGptAskUrl('hi', 'https://evil.io/g/g-x').url).toBe(`${DEFAULT_CHATGPT_URL}?q=hi`);
  });

  it('omits the autorun marker unless asked', () => {
    // Opt-in matters: the extension keys off this marker, and a URL that carries it
    // by default would let any ordinary link submit a message on the user's behalf.
    expect(chatGptAskUrl('hi').url).not.toContain(AUTORUN_MARKER);
    expect(chatGptAskUrl('hi', null, { autorun: false }).url).not.toContain(AUTORUN_MARKER);
  });

  it('appends the autorun marker as a fragment, after the query', () => {
    // A FRAGMENT specifically: fragments never appear in the HTTP request line, so
    // the marker stays between this app and the extension and is not logged upstream.
    const { url } = chatGptAskUrl('hi', 'https://chatgpt.com/g/g-abc', { autorun: true });
    expect(url).toBe(`https://chatgpt.com/g/g-abc?q=hi#${AUTORUN_MARKER}`);
    // The prompt must remain in the query, not slide into the fragment.
    expect(url.split('#')[0]).toContain('q=hi');
  });

  it('carries an over-cap prompt in the marker fragment when autorun is on', () => {
    // The query cap exists because proxies truncate request lines; a fragment is
    // never IN the request line, so it is not subject to that. The extension is what
    // reads it — hence only with autorun.
    const huge = 'x'.repeat(MAX_URL_PROMPT_LENGTH + 1);
    const { url, embedded } = chatGptAskUrl(huge, 'https://chatgpt.com/g/g-abc', {
      autorun: true,
    });
    expect(embedded).toBe(true);
    expect(url.startsWith(`https://chatgpt.com/g/g-abc#${AUTORUN_MARKER}=`)).toBe(true);
    // Nothing in the query: it stayed out of the part a proxy could cut.
    expect(url.split('#')[0]).not.toContain('q=');
    expect(decodeURIComponent(url.split(`#${AUTORUN_MARKER}=`)[1]!)).toBe(huge);
  });

  it('round-trips a Vietnamese over-cap prompt through the fragment', () => {
    // The case that forced this path: diacritics encode ~3x, so the real
    // case-study prompt lands at ~8.5 KB — over the query cap, far under the
    // fragment one.
    const p = 'Phân tích cổ phiếu — '.repeat(400);
    expect(encodeURIComponent(p).length).toBeGreaterThan(MAX_URL_PROMPT_LENGTH);
    const { url, embedded } = chatGptAskUrl(p, null, { autorun: true });
    expect(embedded).toBe(true);
    expect(decodeURIComponent(url.split(`#${AUTORUN_MARKER}=`)[1]!)).toBe(p);
  });

  it('omits the marker when the prompt was too long to embed', () => {
    // Nothing to run. Marking this URL would have the extension fill a composer
    // from a `q` that isn't there, while the UI is telling the user to paste.
    const huge = 'x'.repeat(MAX_FRAGMENT_PROMPT_LENGTH + 1);
    const { url, embedded } = chatGptAskUrl(huge, null, { autorun: true });
    expect(embedded).toBe(false);
    expect(url).not.toContain(AUTORUN_MARKER);
    expect(url).toBe(DEFAULT_CHATGPT_URL);
  });

  it('does not use the fragment path without autorun', () => {
    // Reporting `embedded: true` for a fragment nothing will read would have the UI
    // tell the user the question was sent when it never left the browser.
    const huge = 'x'.repeat(MAX_URL_PROMPT_LENGTH + 1);
    expect(chatGptAskUrl(huge).embedded).toBe(false);
    expect(chatGptAskUrl(huge, null, { autorun: false }).url).toBe(DEFAULT_CHATGPT_URL);
  });

  it('drops an existing fragment when carrying the prompt in one', () => {
    // Two fragments cannot coexist; the marker must be the whole fragment or the
    // extension's `location.hash` check fails and nothing runs.
    const huge = 'x'.repeat(MAX_URL_PROMPT_LENGTH + 1);
    const { url } = chatGptAskUrl(huge, 'https://chatgpt.com/g/g-abc#frag', {
      autorun: true,
    });
    expect(url.split('#').length).toBe(2);
    expect(url).not.toContain('#frag');
  });

  it('keeps the query ahead of a fragment on an already-fragmented base', () => {
    // `base + '?q=' + …` on a URL that already ends in a fragment would bury the
    // parameter inside the fragment, which the server never receives — so the
    // composer would open empty with no sign anything was lost.
    const { url } = chatGptAskUrl('hi', 'https://chatgpt.com/g/g-abc#frag');
    expect(url).toBe('https://chatgpt.com/g/g-abc?q=hi');
  });
});

describe('isCustomGptUrl', () => {
  it('distinguishes a custom GPT from plain chat', () => {
    expect(isCustomGptUrl('https://chatgpt.com/g/g-abc123')).toBe(true);
    expect(isCustomGptUrl(DEFAULT_CHATGPT_URL)).toBe(false);
    expect(isCustomGptUrl('https://chatgpt.com/?q=hello')).toBe(false);
  });

  it('returns false rather than throwing on garbage', () => {
    expect(isCustomGptUrl('nonsense')).toBe(false);
  });
});
