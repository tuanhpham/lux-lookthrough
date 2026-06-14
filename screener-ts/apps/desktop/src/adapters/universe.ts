import { SECTOR_STOCKS } from '@screener/core';
import { http, isTauri } from './http.js';

/**
 * Broad US equity universe — the S&P 500 + 400 + 600 constituents (~1500
 * names), scraped from Wikipedia like the Python backend. Cached in memory for
 * the session; falls back to the curated ~543 list if the fetch/parse fails.
 *
 * Desktop (Tauri) fetches Wikipedia directly via the Rust HTTP layer; the web
 * build routes through the same-origin `/api/wiki` proxy (added to the Vite dev
 * server and the Cloudflare function) to avoid CORS.
 */
const WIKI_PAGES = [
  'List_of_S%26P_500_companies',
  'List_of_S%26P_400_companies',
  'List_of_S%26P_600_companies',
];

const CURATED = [...new Set(Object.values(SECTOR_STOCKS).flat())];

let cache: string[] | null = null;

function base(): string {
  return isTauri() ? 'https://en.wikipedia.org/wiki' : '/api/wiki';
}

/** Pull tickers from the first column of the `constituents` table. */
function parseTickers(html: string): string[] {
  const start = html.indexOf('id="constituents"');
  if (start < 0) return [];
  const slice = html.slice(start, html.indexOf('</table>', start));
  const out: string[] = [];
  for (const row of slice.split('<tr>').slice(2)) {
    const cell = row.split('</td>')[0] ?? '';
    // The ticker is the first column's link text; tolerate attributes/markup.
    const m = cell.match(/>([A-Z][A-Z.]{0,6})<\/a>/) ?? cell.match(/>([A-Z]{1,6}(?:\.[A-Z])?)</);
    if (m && m[1]) out.push(m[1].replace(/\./g, '-')); // BRK.B → BRK-B (Yahoo style)
  }
  return out;
}

export async function getBroadUniverse(): Promise<string[]> {
  if (cache) return cache;
  const all = new Set<string>(CURATED); // always include curated names
  let anyParsed = false;
  for (const page of WIKI_PAGES) {
    try {
      const html = await http().getText(`${base()}/${page}`);
      const tickers = parseTickers(html);
      if (tickers.length > 50) {
        anyParsed = true;
        for (const t of tickers) all.add(t);
      }
    } catch {
      /* skip this page */
    }
  }
  const result = [...all].sort();
  // Only cache a genuinely broad result; otherwise allow a later retry.
  if (anyParsed) cache = result;
  return result;
}

export function curatedUniverse(): string[] {
  return [...CURATED].sort();
}
