/**
 * Dated headlines for one symbol and one window, from more than Yahoo.
 *
 * Yahoo's search endpoint returns the latest few headlines and nothing older, which is why the
 * event finder came back thin for a trade three months ago. Finnhub's company news takes a date
 * range (a year back on the free tier), and Google News RSS honours `after:` / `before:` in the
 * query, so between them a past window actually has news in it. These parsers turn each raw
 * answer into one shape; the app fetches, this only reads.
 */

export interface NewsItem {
  date: string;
  title: string;
  /** The publisher, as the source names it. */
  source: string;
  url: string;
  summary: string;
  provider: 'finnhub' | 'google' | 'yahoo';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s: unknown, n: number): string =>
  String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
const unescape = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m);

/** Finnhub `/company-news`: `[{datetime (unix s), headline, source, url, summary}]`. */
export function parseFinnhubNews(raw: unknown): NewsItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NewsItem[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const t = Number(o.datetime);
    const title = clean(o.headline, 200);
    const url = String(o.url ?? '');
    if (!Number.isFinite(t) || t <= 0 || !title || !/^https?:\/\//.test(url)) continue;
    out.push({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      title, source: clean(o.source, 60), url, summary: clean(o.summary, 280), provider: 'finnhub',
    });
  }
  return out;
}

/**
 * Google News RSS. Read with regexes rather than a DOM parser so it works in core and in tests:
 * the feed is machine-written and its `<item>` blocks are regular. Google appends " - Publisher"
 * to each title; it is split off into `source`.
 */
export function parseGoogleNewsRss(xml: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]!;
    const tag = (name: string): string => {
      const t = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
      return t ? unescape(t[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : '';
    };
    const pub = new Date(tag('pubDate'));
    const url = tag('link');
    let title = clean(tag('title'), 240);
    const source = clean(tag('source'), 60);
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    if (Number.isNaN(pub.getTime()) || !title || !/^https?:\/\//.test(url)) continue;
    out.push({ date: pub.toISOString().slice(0, 10), title, source, url, summary: '', provider: 'google' });
  }
  return out;
}

/**
 * One list: inside the window, newest headline wording de-duplicated across providers, and capped
 * so the prompt stays a prompt. Kept in date order; when two providers carry the same story the
 * one with a summary wins.
 */
export function mergeNews(lists: readonly NewsItem[][], from: string, to: string, cap = 60): NewsItem[] {
  const key = (n: NewsItem): string => `${n.date}|${n.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70)}`;
  const byKey = new Map<string, NewsItem>();
  for (const list of lists) {
    for (const n of list) {
      if (!DATE_RE.test(n.date) || n.date < from || n.date > to) continue;
      const k = key(n);
      const had = byKey.get(k);
      if (!had || (!had.summary && n.summary)) byKey.set(k, n);
    }
  }
  const all = [...byKey.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (all.length <= cap) return all;
  // Too many: keep an even spread over the window rather than only its first weeks.
  const step = all.length / cap;
  return Array.from({ length: cap }, (_, i) => all[Math.floor(i * step)]!);
}
