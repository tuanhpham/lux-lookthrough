/**
 * Window assembly: merge events from every source, dedupe, sort, and answer the
 * questions the Calendar UI asks (what's on this day, what's in my portfolio,
 * how much capital is exposed, is this day even covered by data).
 * PURE — no fetching, no DOM.
 */
import type {
  CatalystEvent,
  CatalystCoverage,
  CatalystKind,
  CatalystWindow,
} from './types.js';
import { addDays } from './parseNasdaq.js';

/** Every date in [from, to] inclusive, as `YYYY-MM-DD`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0=Sun..6=Sat for a `YYYY-MM-DD` string, computed in UTC (no local shift). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isWeekend = (date: string): boolean => {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
};

/**
 * Merge sources into one sorted list. Later sources win on an id collision, so
 * callers should pass richer/more-authoritative sources last (e.g. a manual
 * entry overriding a scraped row). Sorted by date, then impact desc, then
 * symbol — a stable order the UI can render directly.
 */
export function mergeEvents(...groups: readonly CatalystEvent[][]): CatalystEvent[] {
  const byId = new Map<string, CatalystEvent>();
  for (const g of groups) for (const e of g) byId.set(e.id, e);
  return [...byId.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      b.impact - a.impact ||
      (a.symbol ?? '').localeCompare(b.symbol ?? '') ||
      a.title.localeCompare(b.title),
  );
}

export interface CatalystFilter {
  kinds?: readonly CatalystKind[];
  /** Only these tickers (watchlist / portfolio mode). Market-wide events
   * (symbol === null) are kept regardless — a Fed day applies to everything. */
  symbols?: readonly string[];
  /** Drop symbol events below this USD market cap. Rows with an unknown cap are
   * KEPT — silently hiding an event because a field was missing is worse than
   * showing one extra row. */
  minMarketCap?: number;
  minImpact?: number;
}

export function filterEvents(
  events: readonly CatalystEvent[],
  f: CatalystFilter,
): CatalystEvent[] {
  const kinds = f.kinds ? new Set(f.kinds) : null;
  const syms = f.symbols ? new Set(f.symbols.map((s) => s.toUpperCase())) : null;
  return events.filter((e) => {
    if (kinds && !kinds.has(e.kind)) return false;
    if (f.minImpact != null && e.impact < f.minImpact) return false;
    if (e.symbol == null) return true; // market-wide: always relevant
    if (syms && !syms.has(e.symbol)) return false;
    if (f.minMarketCap != null && e.marketCap != null && e.marketCap < f.minMarketCap) return false;
    return true;
  });
}

/** Group into a date → events map, including empty days so the grid can render
 * every cell without the caller doing date arithmetic. */
export function groupByDate(
  events: readonly CatalystEvent[],
  from: string,
  to: string,
): Map<string, CatalystEvent[]> {
  const map = new Map<string, CatalystEvent[]>();
  for (const d of dateRange(from, to)) map.set(d, []);
  for (const e of events) {
    if (e.date < from || e.date > to) continue;
    (map.get(e.date) ?? map.set(e.date, []).get(e.date)!).push(e);
  }
  return map;
}

/**
 * Whether a kind has data for a date. This is the guard against the Nasdaq econ
 * calendar's ~3-week horizon: past `until` there is NO DATA, which the UI must
 * show differently from "no events scheduled". Conflating them turns a blank
 * cell into a false all-clear.
 *
 * Weekends are always covered. US markets are closed and no agency publishes on
 * a Saturday, so those days are known-empty rather than unknown. The sweep skips
 * them to save ~8 requests per window, which would otherwise leave every weekend
 * past `until` flagged as missing data — crying wolf on days nothing can happen.
 */
export function hasCoverage(
  coverage: readonly CatalystCoverage[],
  kind: CatalystKind,
  date: string,
): boolean {
  if (isWeekend(date)) return true;
  const c = coverage.find((x) => x.kind === kind);
  if (!c) return false;
  if (c.failedDates?.includes(date)) return false;
  return date <= c.until;
}

/** Kinds with NO data on `date` — drives the "partial data" hatch/notice. */
export function uncoveredKinds(
  coverage: readonly CatalystCoverage[],
  date: string,
  kinds: readonly CatalystKind[],
): CatalystKind[] {
  return kinds.filter((k) => !hasCoverage(coverage, k, date));
}

export interface DayRisk {
  date: string;
  /** Held symbols with an event that day. */
  symbols: string[];
  /** Their combined share of capital, 0–1. */
  exposure: number;
  events: CatalystEvent[];
}

/**
 * Event risk per day for the positions actually held: which holdings report,
 * and what fraction of capital is exposed. Only `earnings` and `custom` count
 * as position risk — an ex-dividend date is not a risk event, and folding it in
 * would inflate the number until it's ignored.
 *
 * `weights` maps SYMBOL → fraction of capital (0–1).
 */
export function dayRisks(
  events: readonly CatalystEvent[],
  weights: ReadonlyMap<string, number>,
  riskKinds: readonly CatalystKind[] = ['earnings', 'custom'],
): DayRisk[] {
  const kinds = new Set(riskKinds);
  const byDate = new Map<string, DayRisk>();
  for (const e of events) {
    if (!e.symbol || !kinds.has(e.kind)) continue;
    const w = weights.get(e.symbol.toUpperCase());
    if (w == null) continue;
    let day = byDate.get(e.date);
    if (!day) {
      day = { date: e.date, symbols: [], exposure: 0, events: [] };
      byDate.set(e.date, day);
    }
    // A symbol can appear twice (e.g. earnings + a manual note) — count its
    // weight once, or the exposure total overstates the risk.
    if (!day.symbols.includes(e.symbol)) {
      day.symbols.push(e.symbol);
      day.exposure += w;
    }
    day.events.push(e);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Build the cacheable snapshot object. */
export function buildWindow(
  from: string,
  to: string,
  builtOn: string,
  at: number,
  events: CatalystEvent[],
  coverage: CatalystCoverage[],
): CatalystWindow {
  return { builtOn, at, from, to, events, coverage };
}
