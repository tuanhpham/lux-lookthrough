/**
 * "As-of date" (point-in-time) screening. The scanners already treat the LAST
 * bar as "now" with zero lookahead, so historical screening is just: fetch a
 * longer history, then slice every series (and the benchmark) to end on the
 * chosen date. This module holds the per-tab as-of state and the slicing/period
 * helpers shared by Top Picks, Screener, Sectors and the stock detail modal.
 */
import type { Bar, OHLCV, Period, Financials, FinancialPoint, Fundamentals } from '@screener/core';
import { getLang } from './i18n.js';

/** Which scan surface owns an independent as-of selection. */
export type AsOfScope = 'picks' | 'screener' | 'sectors';

/** A tab's as-of selection. `date` null ⇒ live (today, real-time). `yearsBack`
 * is how much history to FETCH (so EMA200 etc. are well-defined before `date`),
 * independent of how far back the picker lets you choose. */
export interface AsOfState {
  date: string | null; // ISO YYYY-MM-DD, or null = live
  yearsBack: 2 | 5 | 10 | 'max';
}

const state: Record<AsOfScope, AsOfState> = {
  picks: { date: null, yearsBack: 2 },
  screener: { date: null, yearsBack: 2 },
  sectors: { date: null, yearsBack: 2 },
};

export function getAsOf(scope: AsOfScope): AsOfState {
  return state[scope];
}
export function setAsOfDate(scope: AsOfScope, date: string | null): void {
  state[scope].date = date && date.trim() ? date.trim() : null;
}
export function setAsOfYearsBack(scope: AsOfScope, years: AsOfState['yearsBack']): void {
  state[scope].yearsBack = years;
}
export function isHistorical(scope: AsOfScope): boolean {
  return state[scope].date != null;
}

/** Today as ISO YYYY-MM-DD (local), used as the picker's max + default. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Shared control row (date picker + years-back + Live reset) ─────────────────

/** HTML for the as-of control toolbar. Drop into any scan tab; then call
 * `wireAsOfControls(scope, root, onChange)` to bind it. */
export function asOfControlsHtml(scope: AsOfScope): string {
  const vi = getLang() === 'vi';
  const s = state[scope];
  const years: AsOfState['yearsBack'][] = [2, 5, 10, 'max'];
  const live = s.date == null;
  return `
    <div class="toolbar asof-row" style="margin-top:-4px">
      <span class="muted" style="font-size:12px">${vi ? '📅 Tính đến ngày' : '📅 As of date'}:</span>
      <input type="date" class="field asof-date" max="${todayIso()}" value="${s.date ?? ''}" style="width:150px" />
      <button class="range-btn asof-live ${live ? 'active' : ''}" title="${vi ? 'Dữ liệu thời gian thực' : 'Live / real-time'}">${vi ? 'Trực tiếp' : 'Live'}</button>
      <span class="muted" style="font-size:12px;margin-left:8px">${vi ? 'Lịch sử' : 'History'}:</span>
      ${years
        .map(
          (y) =>
            `<button class="range-btn asof-years ${y === s.yearsBack ? 'active' : ''}" data-years="${y}">${
              y === 'max' ? 'Max' : y + 'y'
            }</button>`,
        )
        .join('')}
      <span class="asof-flag ${live ? 'hidden' : ''}" style="margin-left:auto">${
        vi ? 'Chế độ lịch sử' : 'Historical mode'
      }</span>
    </div>`;
}

/** Wire the as-of control row. `onChange` fires after the state updates so the
 * caller can re-render / re-show. */
export function wireAsOfControls(scope: AsOfScope, root: HTMLElement, onChange: () => void): void {
  const dateEl = root.querySelector<HTMLInputElement>('.asof-date');
  dateEl?.addEventListener('change', () => {
    setAsOfDate(scope, dateEl.value || null);
    refreshFlag(scope, root);
    onChange();
  });
  root.querySelector<HTMLElement>('.asof-live')?.addEventListener('click', () => {
    setAsOfDate(scope, null);
    if (dateEl) dateEl.value = '';
    refreshFlag(scope, root);
    onChange();
  });
  root.querySelectorAll<HTMLElement>('.asof-years').forEach((b) =>
    b.addEventListener('click', () => {
      const raw = b.dataset.years!;
      setAsOfYearsBack(scope, raw === 'max' ? 'max' : (Number(raw) as 2 | 5 | 10));
      root.querySelectorAll('.asof-years').forEach((x) => x.classList.toggle('active', x === b));
      // Re-fetch only matters in historical mode; fire onChange so the tab can react.
      if (isHistorical(scope)) onChange();
    }),
  );
}

function refreshFlag(scope: AsOfScope, root: HTMLElement): void {
  const live = !isHistorical(scope);
  root.querySelector('.asof-flag')?.classList.toggle('hidden', live);
  root.querySelector('.asof-live')?.classList.toggle('active', live);
}

/** Short human label for a banner, e.g. "As of 2024-03-15". */
export function asOfLabel(scope: AsOfScope): string {
  const s = state[scope];
  if (!s.date) return '';
  return (getLang() === 'vi' ? 'Tính đến ' : 'As of ') + s.date;
}

/** The Yahoo fetch range needed to have `yearsBack` of history BEFORE the
 * as-of date. We over-fetch generously (the slice trims the tail) so the
 * trend filter's EMA200 always has its 200+ prior bars. Live mode keeps 1y. */
export function fetchPeriodFor(scope: AsOfScope, livePeriod: Period = '1y'): Period {
  const s = state[scope];
  if (!s.date) return livePeriod;
  // Need history both BEFORE the date (yearsBack) and the gap from the date to
  // today. Pick the smallest standard range that covers both comfortably.
  if (s.yearsBack === 'max') return 'max';
  const gapYears = (Date.now() - new Date(s.date + 'T00:00:00').getTime()) / (365.25 * 864e5);
  const need = s.yearsBack + gapYears + 0.5; // +0.5y headroom for EMA200 warmup
  if (need <= 2) return '2y';
  if (need <= 5) return '5y';
  return 'max';
}

/** Slice a bar array to those on/before `date` (inclusive). Bars are sorted
 * ascending, so this keeps the leading window the scanner needs. */
export function sliceBars(bars: readonly Bar[], date: string | null): Bar[] {
  if (!date) return [...bars];
  return bars.filter((b) => b.date <= date);
}

/** Slice an OHLCV series in place-safe fashion (returns a new object). */
export function sliceSeries(series: OHLCV, date: string | null): OHLCV {
  if (!date) return series;
  return { symbol: series.symbol, bars: sliceBars(series.bars, date) };
}

/** Slice every series in a fetched map to the as-of date. Returns a new map. */
export function sliceMap(map: Map<string, OHLCV>, date: string | null): Map<string, OHLCV> {
  if (!date) return map;
  const out = new Map<string, OHLCV>();
  for (const [sym, series] of map) out.set(sym, sliceSeries(series, date));
  return out;
}

/** Suffix for the once-a-day scan cache key so a historical scan caches under
 * its own slot and never collides with (or sync-pollutes) the live one. */
export function cacheSuffix(scope: AsOfScope): string {
  const s = state[scope];
  return s.date ? `@${s.date}` : '';
}

/**
 * Derive a point-in-time-ish Fundamentals stat-grid view for a past date.
 * Yahoo's live quoteSummary only returns TODAY's TTM figures, so for history we
 * fall back to the latest ANNUAL statement reported on/before the date (from
 * the dated financials timeseries) plus price-derived values from the sliced
 * bars. Approximate but genuinely historical — labeled "(annual, as-of)" in UI.
 */
export function fundamentalsAsOf(
  live: Fundamentals,
  fin: Financials,
  slicedBars: readonly Bar[],
  date: string,
): Fundamentals {
  const price = slicedBars.length ? slicedBars[slicedBars.length - 1]!.close : null;

  // Latest annual statement reported on/before the as-of date.
  const annualBefore = fin.annual
    .filter((p) => p.period <= date)
    .sort((a, b) => (a.period < b.period ? 1 : -1));
  const latest: FinancialPoint | undefined = annualBefore[0];
  const prior: FinancialPoint | undefined = annualBefore[1];

  const eps = latest?.eps ?? null;
  const peRatio = price != null && eps != null && eps !== 0 ? price / eps : null;
  const revenueGrowth =
    latest?.revenue != null && prior?.revenue != null && prior.revenue !== 0
      ? (latest.revenue - prior.revenue) / prior.revenue
      : null;
  const profitMargin =
    latest?.netIncome != null && latest?.revenue != null && latest.revenue !== 0
      ? latest.netIncome / latest.revenue
      : null;

  // 52-week range from the trailing year of sliced bars.
  const yearAgo = new Date(date + 'T00:00:00');
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const yearAgoIso = yearAgo.toISOString().slice(0, 10);
  const window = slicedBars.filter((b) => b.date >= yearAgoIso);
  const week52High = window.length ? Math.max(...window.map((b) => b.high)) : null;
  const week52Low = window.length ? Math.min(...window.map((b) => b.low)) : null;

  return {
    symbol: live.symbol,
    name: live.name,
    sector: live.sector,
    industry: live.industry,
    currency: live.currency,
    summary: live.summary,
    website: live.website,
    beta: live.beta, // structural, ~stable — keep the live value
    currentPrice: price,
    // Point-in-time-derived (annual basis):
    eps,
    peRatio,
    revenueGrowth,
    profitMargin,
    week52High,
    week52Low,
    // Not reconstructable historically → leave null so the UI shows "—".
    marketCap: null,
    roe: null,
    dividendYield: null,
  };
}
