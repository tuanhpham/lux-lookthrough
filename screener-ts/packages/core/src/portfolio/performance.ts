/**
 * Performance by period — 1D, 1W, 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y, since inception (CHAT-105).
 *
 * ── TIME-WEIGHTED, SO A DEPOSIT IS NOT A GAIN ────────────────────────────────
 * Each period's % is the ratio of the TWR index (`computeTwr`, which strips every cash flow) at
 * the end to the index at the period's start: the decisions' return, comparable across accounts
 * and against a benchmark. Beside it, the money: the equity change over the period minus the
 * cash that came in or went out, i.e. what the account EARNED in that window.
 *
 * ── THE START OF A PERIOD ────────────────────────────────────────────────────
 * The last snapshot on or before the calendar start (a weekend, a holiday or a missed update
 * uses the session before). A period that starts before the account existed is not available
 * (null): "1Y: +40%" for a three-month-old account would be a three-month number with a
 * one-year label. Since inception always exists once there is one snapshot: it starts at the
 * opening capital, before the first snapshot. YTD starts at the last snapshot of the previous
 * year — or, for an account opened this year, at inception, which IS its year to date.
 *
 * Periods of a year or more also carry the annualized rate, the only fair way to put a 5-year
 * number beside a 1-year one.
 */
import type { AccountState } from '../types/index.js';
import { computeTwr } from './twr.js';
import { pyRound } from '../util/round.js';

export type PeriodKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'SI';
export const PERIODS: readonly PeriodKey[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'SI'];

export interface PeriodResult {
  key: PeriodKey;
  /** The snapshot the period is measured from (null = the opening capital, before the first). */
  from: string | null;
  to: string;
  /** Time-weighted return in %, or null when the account is younger than the period. */
  pct: number | null;
  /** Money earned in the window: Δequity − net cash flows, in the account's currency. */
  pnl: number | null;
  /** For periods of a year or more: the same return per year, in %. */
  annualizedPct: number | null;
}

export interface PerformanceSummary {
  asOf: string | null;
  inception: string | null;
  periods: PeriodResult[];
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
function shift(date: string, { days = 0, months = 0, years = 0 }: { days?: number; months?: number; years?: number }): string {
  const d = new Date(date + 'T00:00:00Z');
  if (years) d.setUTCFullYear(d.getUTCFullYear() + years);
  if (months) d.setUTCMonth(d.getUTCMonth() + months);
  if (days) d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
const daysBetween = (a: string, b: string): number => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

export function periodPerformance(state: AccountState): PerformanceSummary {
  const twr = computeTwr(state);
  const pts = twr.points;
  if (!pts.length) return { asOf: null, inception: null, periods: PERIODS.map((key) => ({ key, from: null, to: '', pct: null, pnl: null, annualizedPct: null })) };

  const equityOn = new Map<string, number>();
  for (const s of state.snapshots ?? []) equityOn.set(s.date, s.equity);
  const flows = (state.cashFlows ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = pts[0]!.date;
  const last = pts[pts.length - 1]!;
  const opening = state.account.initialCapital + flows.filter((f) => f.date < first).reduce((s, f) => s + f.amount, 0);

  /** Index of the last point on or before `date`, or -1 before the first. */
  const at = (date: string): number => {
    let lo = 0, hi = pts.length - 1, hit = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid]!.date <= date) { hit = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return hit;
  };

  const measure = (key: PeriodKey, startIdx: number | 'inception'): PeriodResult => {
    const fromDate = startIdx === 'inception' ? null : pts[startIdx]!.date;
    const startIndex = startIdx === 'inception' ? 1 : pts[startIdx]!.index;
    const startEquity = startIdx === 'inception' ? opening : equityOn.get(fromDate!) ?? 0;
    const flowIn = flows.filter((f) => (fromDate === null ? f.date >= first : f.date > fromDate) && f.date <= last.date).reduce((s, f) => s + f.amount, 0);
    const pct = startIndex > 0 ? (last.index / startIndex - 1) * 100 : null;
    const endEquity = equityOn.get(last.date) ?? 0;
    const spanDays = daysBetween(fromDate ?? first, last.date);
    const annual = ['1Y', '3Y', '5Y', 'SI'].includes(key) && pct !== null && spanDays >= 365
      ? ((1 + pct / 100) ** (365 / spanDays) - 1) * 100
      : null;
    return {
      key, from: fromDate, to: last.date,
      pct: pct === null ? null : pyRound(pct, 4),
      pnl: pyRound(endEquity - startEquity - flowIn, 2),
      annualizedPct: annual === null ? null : pyRound(annual, 4),
    };
  };
  const none = (key: PeriodKey): PeriodResult => ({ key, from: null, to: last.date, pct: null, pnl: null, annualizedPct: null });

  const back = (key: PeriodKey, start: string): PeriodResult => {
    if (start < first) return none(key);               // younger than the period
    const i = at(start);
    return i < 0 || i === pts.length - 1 ? none(key) : measure(key, i);
  };

  const end = last.date;
  const periods: PeriodResult[] = [
    pts.length >= 2 ? measure('1D', pts.length - 2) : none('1D'),
    back('1W', shift(end, { days: -7 })),
    back('1M', shift(end, { months: -1 })),
    back('3M', shift(end, { months: -3 })),
    back('6M', shift(end, { months: -6 })),
    (() => {
      const dec31 = `${Number(end.slice(0, 4)) - 1}-12-31`;
      if (first > dec31) return measure('YTD', 'inception');   // opened this year: SI is its YTD
      const i = at(dec31);
      return i < 0 ? none('YTD') : measure('YTD', i);
    })(),
    back('1Y', shift(end, { years: -1 })),
    back('3Y', shift(end, { years: -3 })),
    back('5Y', shift(end, { years: -5 })),
    measure('SI', 'inception'),
  ];
  return { asOf: end, inception: first, periods };
}

/**
 * Several accounts as one, for the overview: equity summed per date (each account carried
 * forward over the days it has no snapshot), every account's flows, and — the part that keeps
 * the combined TWR honest — each LATER account's opening capital booked as a deposit on its
 * first day. Without that, opening a second account would read as a jump in performance.
 * Amounts are summed as they are; the caller converts currencies first if they differ.
 */
export function combineAccounts(states: readonly AccountState[]): AccountState | null {
  const withSnaps = states.filter((s) => (s.snapshots ?? []).length);
  if (!withSnaps.length) return null;
  const series = withSnaps.map((s) => {
    const m = new Map<string, number>();
    for (const p of s.snapshots ?? []) m.set(p.date, p.equity);
    return { s, m, first: [...m.keys()].sort()[0]! };
  });
  const dates = [...new Set(series.flatMap((x) => [...x.m.keys()]))].sort();
  const earliest = dates[0]!;
  const carried = new Map<AccountState, number>();
  const snapshots = dates.map((date) => {
    let eq = 0;
    for (const x of series) {
      const v = x.m.get(date);
      if (v !== undefined) carried.set(x.s, v);
      eq += carried.get(x.s) ?? 0;
    }
    return { date, equity: eq, cash: 0, positionsValue: 0 };
  });
  const cashFlows = series.flatMap((x) => {
    const own = x.s.cashFlows ?? [];
    if (x.first <= earliest) return own;
    // A later account: its opening capital — and anything it was funded with before its first
    // snapshot — arrives as ONE deposit on the day it first shows up in the sum.
    const before = own.filter((f) => f.date < x.first).reduce((t, f) => t + f.amount, 0);
    return [
      { id: `open:${x.s.account.id}`, accountId: x.s.account.id, date: x.first, amount: x.s.account.initialCapital + before },
      ...own.filter((f) => f.date >= x.first),
    ];
  });
  const initialCapital = series.filter((x) => x.first === earliest).reduce((t, x) => t + x.s.account.initialCapital, 0);
  return {
    account: { id: 'all', name: 'All accounts', initialCapital, currency: withSnaps[0]!.account.currency, createdAt: earliest },
    lots: [], sells: [], orders: [], snapshots, cashFlows,
  } as unknown as AccountState;
}
