/**
 * Fetches the rolling catalyst window from api.nasdaq.com and merges it with the
 * rule-based events computed locally.
 *
 * REQUEST BUDGET (verified against the live API on 2026-08-07) — this is why the
 * fan-out lives here and not in the Cloudflare function, which is capped at 50
 * subrequests per invocation:
 *   earnings    1 call per weekday          ≈ 22 calls for 30 days
 *   dividends   1 call per weekday          ≈ 22 calls
 *   splits      1 call TOTAL — one request returns every upcoming split
 *   ipo         1 call per month touched    ≈ 2 calls
 *   econ        1 call per weekday, but the feed is empty past ~3 weeks
 *                                          ≈ 15 calls
 *   ──────────────────────────────────────────────────────────────
 *   ≈ 62 calls, each a separate same-origin request through the dumb proxy.
 *
 * Weekends are skipped: US markets are closed, so those days are always empty
 * and fetching them would waste ~8 calls per window.
 *
 * Rate-limited and run once a day (the result is snapshotted), so the cost is
 * one sweep per day per device, not per tab open.
 */
import {
  type CatalystEvent,
  type CatalystCoverage,
  type CatalystKind,
  type CatalystWindow,
  RateLimiter,
  addDays,
  buildWindow,
  dateRange,
  derivedEvents,
  isWeekend,
  mergeEvents,
  parseDividends,
  parseEarnings,
  parseEconEvents,
  parseIpos,
  parseSplits,
} from '@screener/core';
import { http, isTauri } from './http.js';

/** Days ahead of today the window covers (today + 30). */
export const WINDOW_DAYS = 30;

function base(): string {
  // Tauri talks to the upstream directly through the Rust HTTP layer (no CORS);
  // the web build goes through the same-origin proxy that adds the browser
  // headers api.nasdaq.com demands.
  return isTauri() ? 'https://api.nasdaq.com/api' : '/api/nasdaqcal';
}

/** Local calendar date (YYYY-MM-DD) — matches scanCache's `today()`. */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface FetchProgress {
  done: number;
  total: number;
  label: string;
}

/**
 * One rate-limited GET. Returns null on ANY failure so a single bad day can't
 * abort the sweep — the caller records the date as uncovered, which the UI shows
 * as "no data" rather than silently as "no events".
 */
async function tryGet<T>(limiter: RateLimiter, url: string): Promise<T | null> {
  try {
    return await limiter.run(() => http().getJson<T>(url));
  } catch {
    return null;
  }
}

/**
 * Sweep the whole window. `onProgress` fires per completed request so the UI can
 * show real progress on the ~60-call first run.
 */
export async function fetchCatalystWindow(
  opts: { from?: string; days?: number; onProgress?: (p: FetchProgress) => void } = {},
): Promise<CatalystWindow> {
  const from = opts.from ?? todayLocal();
  const to = addDays(from, opts.days ?? WINDOW_DAYS);
  // ~7 req/s: fast enough that a 60-call sweep takes ~9s, gentle enough that
  // Nasdaq doesn't start throttling mid-window.
  const limiter = new RateLimiter(140, 3, () => Date.now(), (ms) => new Promise((r) => setTimeout(r, ms)));

  const tradingDays = dateRange(from, to).filter((d) => !isWeekend(d));
  const months = [...new Set(tradingDays.map((d) => d.slice(0, 7)))];

  let done = 0;
  const total = tradingDays.length * 3 + months.length + 1;
  const tick = (label: string): void => {
    done++;
    opts.onProgress?.({ done, total, label });
  };

  const events: CatalystEvent[][] = [];
  /** Highest date we actually got data for, per kind. */
  const lastOk: Partial<Record<CatalystKind, string>> = {};
  const failed: Partial<Record<CatalystKind, string[]>> = {};
  /** Days the live econ feed actually answered — the derived macro table defers
   * to these and only fills the rest. */
  const liveMacroDates = new Set<string>();

  const note = (kind: CatalystKind, date: string, ok: boolean): void => {
    if (ok) {
      if (!lastOk[kind] || date > lastOk[kind]!) lastOk[kind] = date;
    } else {
      (failed[kind] ??= []).push(date);
    }
  };

  // ── per-day sweeps (earnings, dividends, econ) ───────────────────────────
  await Promise.all([
    (async () => {
      for (const day of tradingDays) {
        const json = await tryGet<unknown>(limiter, `${base()}/calendar/earnings?date=${day}`);
        // A 200 with `rows: null` is a real "nothing scheduled" answer, so it
        // still counts as covered — only a transport failure is uncovered.
        note('earnings', day, json !== null);
        if (json) events.push(parseEarnings(json, day));
        tick(`Earnings ${day}`);
      }
    })(),
    (async () => {
      for (const day of tradingDays) {
        const json = await tryGet<unknown>(limiter, `${base()}/calendar/dividends?date=${day}`);
        note('dividend', day, json !== null);
        if (json) events.push(parseDividends(json, day));
        tick(`Dividends ${day}`);
      }
    })(),
    (async () => {
      for (const day of tradingDays) {
        const json = await tryGet<unknown>(limiter, `${base()}/calendar/economicevents?date=${day}`);
        // This feed returns `data: null` + "No record found" once past its ~3
        // week horizon. That is NOT coverage — treat it as the horizon end so
        // the UI can hatch those cells instead of implying an empty calendar.
        const hasData = !!json && !!(json as { data?: unknown }).data;
        note('macro', day, hasData);
        if (hasData) liveMacroDates.add(day);
        if (json) events.push(parseEconEvents(json, day));
        tick(`Economic events ${day}`);
      }
    })(),
  ]);

  // ── splits: ONE request covers the entire forward window ─────────────────
  {
    const json = await tryGet<unknown>(limiter, `${base()}/calendar/splits?date=${from}`);
    note('split', to, json !== null);
    if (json) events.push(parseSplits(json).filter((e) => e.date >= from && e.date <= to));
    tick('Splits');
  }

  // ── IPOs + lockup expiries: one request per month touched ────────────────
  for (const month of months) {
    const json = await tryGet<unknown>(limiter, `${base()}/ipo/calendar?date=${month}`);
    note('ipo', to, json !== null);
    note('lockup', to, json !== null);
    if (json) events.push(parseIpos(json, { from, to }));
    tick(`IPOs ${month}`);
  }

  // ── rule-based events: always full coverage, no API ──────────────────────
  // Hand the derived table the econ feed's horizon so the LIVE feed wins inside
  // it and the table only fills the gap past it. Verified necessary: the table
  // has CPI on 2026-08-12, the feed has it on 08-13 — without this the calendar
  // shows CPI on both days, one of them a phantom.
  events.push(derivedEvents(from, to, liveMacroDates));
  // Expiry/rebalance are pure calendar rules, so they genuinely cover the whole
  // window. `custom` is hand-entered — absence means you added none, not missing
  // data.
  lastOk.expiry = to;
  lastOk.rebalance = to;
  lastOk.custom = to;
  // `macro` deliberately keeps the ECON FEED's horizon even though the derived
  // table supplies FOMC/CPI/NFP past it. Beyond that horizon we have the big
  // three but NOT the long tail (PPI, retail sales, ISM, jobless claims) — so
  // the day is genuinely incomplete, and claiming full coverage would hide it.


  const coverage: CatalystCoverage[] = (
    ['earnings', 'dividend', 'split', 'ipo', 'lockup', 'macro', 'expiry', 'rebalance', 'custom'] as CatalystKind[]
  ).map((kind) => ({
    kind,
    until: lastOk[kind] ?? from,
    ...(failed[kind]?.length ? { failedDates: failed[kind] } : {}),
  }));

  return buildWindow(from, to, todayLocal(), Date.now(), mergeEvents(...events), coverage);
}
