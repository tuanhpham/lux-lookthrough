/**
 * The headlines for one symbol and one window, gathered from three places at once.
 *
 * Each source fails on its own: Finnhub needs the server's key, Google News can rate-limit a
 * shared IP, Yahoo only has recent news. Whatever answers is used, and the counts say which
 * did, so a thin list is explained rather than mysterious.
 */
import { mergeNews, parseFinnhubNews, parseGoogleNewsRss, type NewsItem } from '@screener/core';
import { isTauri } from './http.js';
import { searchNews } from './webSearch.js';

export interface GatheredNews {
  items: NewsItem[];
  counts: { finnhub: number; google: number; yahoo: number };
}

async function finnhub(sym: string, from: string, to: string): Promise<NewsItem[]> {
  if (isTauri()) return []; // the key lives on the server; the desktop build has no relay for it
  const r = await fetch(`/api/finnhub/company-news?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}`);
  if (!r.ok) return [];
  return parseFinnhubNews(await r.json());
}

async function google(sym: string, from: string, to: string): Promise<NewsItem[]> {
  const q = `${sym} stock after:${from} before:${to}`;
  const url = isTauri()
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
    : `/api/gnews?q=${encodeURIComponent(q)}&hl=en-US`;
  const r = await fetch(url);
  if (!r.ok) return [];
  return parseGoogleNewsRss(await r.text());
}

async function yahoo(sym: string): Promise<NewsItem[]> {
  const rows = await searchNews(sym, 10);
  return rows.map((n) => ({ date: n.date, title: n.title, source: n.publisher, url: n.url, summary: '', provider: 'yahoo' as const }));
}

export async function gatherNews(symbol: string, from: string, to: string): Promise<GatheredNews> {
  const sym = symbol.trim().toUpperCase();
  const [f, g, y] = await Promise.all([
    finnhub(sym, from, to).catch(() => []),
    google(sym, from, to).catch(() => []),
    yahoo(sym).catch(() => []),
  ]);
  const items = mergeNews([f, g, y], from, to, 60);
  const n = (p: NewsItem['provider']): number => items.filter((i) => i.provider === p).length;
  return { items, counts: { finnhub: n('finnhub'), google: n('google'), yahoo: n('yahoo') } };
}
