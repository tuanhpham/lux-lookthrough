/**
 * Past earnings *announcement* dates for one symbol — the "E" markers under the
 * candles, TradingView style.
 *
 * WHY NASDAQ AND NOT YAHOO: what a chart marker needs is the day the company
 * REPORTED, and Yahoo does not hand that out. `fundamentals-timeseries` and
 * `earningsHistory` return fiscal period-END dates (Jun 2026, Sep 2026…), which
 * are typically 3-5 weeks before the release — putting a marker there would draw
 * the reaction candle in the wrong place, which is worse than drawing nothing.
 * `calendarEvents` has the real date but only the NEXT one, and needs the crumb.
 * Nasdaq's earnings-surprise table gives `dateReported` per quarter, plus actual
 * vs consensus EPS — exactly the tooltip content TradingView shows.
 *
 * THE LIMIT, stated plainly: Nasdaq returns the LAST FOUR QUARTERS only. So a 1Y
 * chart is fully marked and a 5Y chart carries markers on its right-hand year.
 * There is no free source for a decade of report dates; four quarters is what is
 * honestly available, and the caller must not pretend otherwise.
 *
 * Upcoming earnings are NOT fetched here — the Calendar tab already snapshots
 * the real Nasdaq calendar, and `stockModal` reads the next event from there.
 */
import { http, isTauri } from './http.js';

export interface EarningsReport {
  /** Report date, YYYY-MM-DD (the day Nasdaq says the release landed). */
  date: string;
  /** Fiscal quarter the release covered, as Nasdaq labels it ("Jun 2026"). */
  fiscalQtr: string;
  eps: number | null;
  consensus: number | null;
  /** Percent surprise vs consensus; positive = beat. */
  surprisePct: number | null;
}

interface SurpriseRow {
  fiscalQtrEnd?: string;
  dateReported?: string;
  eps?: number | string;
  consensusForecast?: number | string;
  percentageSurprise?: number | string;
}

interface SurpriseJson {
  data?: { earningsSurpriseTable?: { rows?: SurpriseRow[] | null } | null } | null;
}

function base(): string {
  // Same split as CatalystProvider: Tauri hits the upstream directly (no CORS),
  // the web build goes through the same-origin proxy that supplies the browser
  // headers api.nasdaq.com insists on.
  return isTauri() ? 'https://api.nasdaq.com/api' : '/api/nasdaqcal';
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Nasdaq sends `M/D/YYYY`. Bars are keyed `YYYY-MM-DD`, so normalise. */
function isoDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null;
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

/** Vietnamese listings carry a `.VN` suffix here. Nasdaq knows nothing about
 * them, and a three-letter VN ticker can collide with a real US one — so bail
 * out rather than risk marking VCB with some American company's report dates. */
function unsupported(symbol: string): boolean {
  return /\.(VN|HN|UP)$/i.test(symbol.trim());
}

const CACHE_PREFIX = 'earnDates.v1.';
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // report dates only change when a new one lands

function readCache(symbol: string): EarningsReport[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + symbol);
    if (!raw) return null;
    const { ts, rows } = JSON.parse(raw) as { ts: number; rows: EarningsReport[] };
    if (!Array.isArray(rows) || Date.now() - ts > TTL_MS) return null;
    return rows;
  } catch {
    return null;
  }
}

function writeCache(symbol: string, rows: EarningsReport[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + symbol, JSON.stringify({ ts: Date.now(), rows }));
  } catch {
    /* quota / private mode — the in-flight map still dedupes within the session */
  }
}

/** In-flight + session cache: opening the same stock twice, or switching the
 * chart range (which redraws), must not re-hit the network. */
const inflight = new Map<string, Promise<EarningsReport[]>>();

/**
 * Last four reported quarters, newest first. Never throws: any failure — offline,
 * proxy 403, unknown ticker — resolves to `[]`, which the chart renders as "no
 * markers" rather than an error.
 */
export function fetchEarningsReports(symbol: string): Promise<EarningsReport[]> {
  const sym = symbol.trim().toUpperCase();
  if (!sym || unsupported(sym)) return Promise.resolve([]);

  const hit = inflight.get(sym);
  if (hit) return hit;
  const cached = readCache(sym);
  if (cached) {
    const p = Promise.resolve(cached);
    inflight.set(sym, p);
    return p;
  }

  const p = (async () => {
    try {
      const json = await http().getJson<SurpriseJson>(
        `${base()}/company/${encodeURIComponent(sym)}/earnings-surprise`,
      );
      const rows = json?.data?.earningsSurpriseTable?.rows ?? [];
      const out: EarningsReport[] = [];
      for (const r of rows) {
        const date = isoDate(r.dateReported);
        if (!date) continue;
        out.push({
          date,
          fiscalQtr: (r.fiscalQtrEnd ?? '').trim(),
          eps: num(r.eps),
          consensus: num(r.consensusForecast),
          surprisePct: num(r.percentageSurprise),
        });
      }
      out.sort((a, b) => (a.date < b.date ? 1 : -1));
      writeCache(sym, out);
      return out;
    } catch {
      // Don't cache a failure: the next open should retry.
      inflight.delete(sym);
      return [];
    }
  })();
  inflight.set(sym, p);
  return p;
}
