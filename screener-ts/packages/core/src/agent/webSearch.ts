/**
 * Reading search results into rows a model can cite.
 *
 * ── WHY THE APP SEARCHES, NOT THE MODEL VENDOR ──────────────────────────────
 * Most of the user's providers speak the OpenAI chat/completions wire (OpenAI, XPIKI,
 * Gemini, Groq, DeepSeek), and that endpoint has no search of its own. Anthropic has a
 * server-side search tool, but using it would give one provider a power the others lack,
 * and a question would answer differently depending on which key happened to be set.
 * So `web_search` is an ordinary read tool: the app fetches, these functions parse, and
 * every provider gets the same rows.
 *
 * ── TWO SOURCES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS ────────────────────
 * • News — Yahoo Finance's search endpoint (`v1/finance/search?newsCount=`). Dated,
 *   ticker-tagged headlines: the right source for "why is NVDA up today".
 * • Web — DuckDuckGo's HTML page. Undated, general: the right source for "what does
 *   this company do" or "when is the FDA decision".
 * Neither has an API contract. Both are scraped, and a markup change upstream makes the
 * parser return nothing — which is why both return an empty list rather than throwing,
 * and the executor says "no results" rather than inventing some.
 *
 * ── RESULTS ARE UNTRUSTED TEXT ──────────────────────────────────────────────
 * A title or snippet is whatever a web page chose to say, including "ignore your
 * instructions". Tags are stripped and entities decoded here so the model sees plain
 * characters; the prompt tells it these rows are data, never instructions.
 *
 * Pure: no fetch, no DOM, no clock.
 */

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface NewsResult {
  title: string;
  publisher: string;
  url: string;
  /** Publication date, `YYYY-MM-DD` (UTC). */
  date: string;
  tickers: string[];
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
};

/** Decode the entities a search page actually emits: named, `&#39;` and `&#x27;`. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    const b = body.toLowerCase();
    if (b.startsWith('#x')) return safeChar(parseInt(b.slice(2), 16), m);
    if (b.startsWith('#')) return safeChar(parseInt(b.slice(1), 10), m);
    return NAMED[b] ?? m;
  });
}

function safeChar(code: number, fallback: string): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
}

/** Markup to one line of plain text. */
function plain(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * DuckDuckGo wraps every link in a redirect: `//duckduckgo.com/l/?uddg=<real url>&rut=…`.
 * The real address is what a citation needs, so it is unwrapped; anything that is not
 * http(s) after unwrapping is dropped rather than handed to a model as a link.
 */
function unwrapDdgHref(href: string): string | null {
  const raw = decodeEntities(href);
  const m = /[?&]uddg=([^&]+)/.exec(raw);
  let url = raw;
  if (m) {
    try {
      url = decodeURIComponent(m[1]!);
    } catch {
      return null;
    }
  }
  if (url.startsWith('//')) url = 'https:' + url;
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Parse DuckDuckGo's HTML results page.
 *
 * Each organic result carries an `a.result__a` (title + wrapped link) and, later in the
 * same block, an `a.result__snippet` or `div.result__snippet`. Ads are the same markup
 * inside a `result--ad` block, and are skipped: an advertiser's page is not a source.
 */
export function parseDdgHtml(html: string, limit = 8): WebResult[] {
  const out: WebResult[] = [];
  // Cut the page at each result container so a snippet can never be paired with the
  // wrong title. A container is a div whose class list has the bare word `result`
  // (`result__body` and `serp__results` are not containers).
  const starts: { at: number; ad: boolean }[] = [];
  for (const m of html.matchAll(/<div\b[^>]*\bclass="([^"]*)"/gi)) {
    const classes = m[1]!.split(/\s+/);
    if (classes.includes('result')) starts.push({ at: m.index!, ad: classes.includes('result--ad') });
  }
  const headRe = /class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const headReAlt = /href="([^"]+)"[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i;
  const snipRe = /class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i;
  const seen = new Set<string>();

  for (let i = 0; i < starts.length && out.length < limit; i++) {
    if (starts[i]!.ad) continue;
    const block = html.slice(starts[i]!.at, starts[i + 1]?.at ?? html.length);
    const head = headRe.exec(block) ?? headReAlt.exec(block);
    if (!head) continue;
    const url = unwrapDdgHref(head[1]!);
    const title = plain(head[2]!);
    if (!url || !title || seen.has(url)) continue;
    // DuckDuckGo's own ad click-through, in case the class marker ever moves.
    if (/duckduckgo\.com\/y\.js/i.test(url)) continue;
    seen.add(url);
    const snip = snipRe.exec(block);
    out.push({ title, url, snippet: snip ? plain(snip[1]!).slice(0, 400) : '' });
  }
  return out;
}

/**
 * True when DuckDuckGo answered with its bot challenge instead of results.
 *
 * Told apart from "no results" because the two mean different things to the user: an
 * empty result set is an answer, a challenge is search being unavailable from this
 * network — and a model told "nothing found" would say the topic has no coverage.
 */
export function isDdgChallenge(html: string): boolean {
  return /anomaly\.js|anomaly-modal|id="challenge-form"/i.test(html) && !/class="[^"]*\bresult__a\b/.test(html);
}

interface YahooNewsItem {
  title?: unknown;
  publisher?: unknown;
  link?: unknown;
  providerPublishTime?: unknown;
  relatedTickers?: unknown;
}

/**
 * Parse Yahoo Finance's `v1/finance/search` response.
 *
 * Newest first, because "why is it moving" is almost always about the latest story and
 * Yahoo's order is relevance, not time.
 */
export function parseYahooNews(json: unknown, limit = 8): NewsResult[] {
  const news = (json as { news?: unknown } | null)?.news;
  if (!Array.isArray(news)) return [];
  const rows: (NewsResult & { t: number })[] = [];
  for (const raw of news as YahooNewsItem[]) {
    if (!raw || typeof raw.title !== 'string' || typeof raw.link !== 'string') continue;
    if (!/^https?:\/\//i.test(raw.link)) continue;
    const t = typeof raw.providerPublishTime === 'number' ? raw.providerPublishTime : 0;
    rows.push({
      title: plain(raw.title),
      publisher: typeof raw.publisher === 'string' ? plain(raw.publisher) : '',
      url: raw.link,
      date: t > 0 ? new Date(t * 1000).toISOString().slice(0, 10) : '',
      tickers: Array.isArray(raw.relatedTickers)
        ? raw.relatedTickers.filter((x): x is string => typeof x === 'string').slice(0, 8)
        : [],
      t,
    });
  }
  return rows
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map(({ t: _t, ...r }) => r);
}
