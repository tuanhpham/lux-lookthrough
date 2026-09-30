/**
 * The network half of the assistant's `web_search` tool. Parsing lives in core
 * (`agent/webSearch.ts`), where it is tested against captured pages.
 *
 * Same split as every other adapter: Tauri calls the upstream directly through the
 * Rust HTTP layer (no CORS), the web build goes through a same-origin relay.
 *
 * DuckDuckGo is POSTed to, never GETted: a scripted GET is answered with its bot
 * challenge, the same query as a form POST with results. See functions/api/search.
 */
import {
  isDdgChallenge,
  parseDdgHtml,
  parseYahooNews,
  type NewsResult,
  type WebResult,
} from '@screener/core';
import { http, isTauri } from './http.js';

export type WebSearchOutcome =
  | { ok: true; results: WebResult[] }
  | { ok: false; reason: 'blocked' | 'failed'; detail: string };

async function postForm(url: string, body: string): Promise<{ status: number; text: string }> {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  };
  if (isTauri()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const res = await tauriFetch(url, {
      ...init,
      headers: {
        ...init.headers,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        referer: 'https://html.duckduckgo.com/',
      },
    });
    return { status: res.status, text: await res.text() };
  }
  const res = await fetch(url, init);
  return { status: res.status, text: await res.text() };
}

export async function searchWeb(query: string, limit: number): Promise<WebSearchOutcome> {
  const url = isTauri() ? 'https://html.duckduckgo.com/html/' : '/api/search';
  try {
    const { status, text } = await postForm(url, new URLSearchParams({ q: query }).toString());
    if (isDdgChallenge(text)) {
      return { ok: false, reason: 'blocked', detail: 'DuckDuckGo answered with a bot challenge' };
    }
    if (status >= 400) return { ok: false, reason: 'failed', detail: `HTTP ${status}` };
    return { ok: true, results: parseDdgHtml(text, limit) };
  } catch (e) {
    return { ok: false, reason: 'failed', detail: String(e).slice(0, 160) };
  }
}

/** Yahoo Finance headlines matching a query or ticker. Throws on network failure. */
export async function searchNews(query: string, limit: number): Promise<NewsResult[]> {
  const base = isTauri() ? 'https://query1.finance.yahoo.com' : '/api/yahoo';
  const url = `${base}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=${Math.min(limit * 2, 20)}&enableFuzzyQuery=false`;
  return parseYahooNews(await http().getJson<unknown>(url), limit);
}
