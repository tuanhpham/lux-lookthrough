import type { AccountState } from '../types/index.js';
import { pyRound } from '../util/round.js';

/** Whole-number day difference between two ISO dates (b - a). */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export interface TwrPoint {
  date: string;
  /** Growth-of-1 index — 1.0 at the start of the window, 1.25 = +25%. */
  index: number;
  /** This period's return as a fraction (0.01 = +1%), cash flow removed. */
  periodReturn: number;
}

export interface TwrResult {
  points: TwrPoint[];
  /** Cumulative time-weighted return over the snapshot window, in %. */
  totalPct: number;
  /** `totalPct` annualized over 365 calendar days, in %. 0 for a sub-day window. */
  annualizedPct: number;
  /** Peak-to-trough drawdown of the index, in %. Cash-flow neutral. */
  maxDrawdownPct: number;
}

const EMPTY: TwrResult = { points: [], totalPct: 0, annualizedPct: 0, maxDrawdownPct: 0 };

/**
 * Time-weighted return from the daily equity snapshots.
 *
 * Why this exists next to `totalPnLPct`: that one is (equity − contributed) /
 * contributed, which answers "what did my money earn" and therefore moves when
 * you deposit. Top up a 10k account that had doubled with another 90k and it
 * drops from +100% to +10% without a single trade. TWR answers "how good were
 * the decisions" and is what you compare against a benchmark or another account.
 *
 * Per period: r_t = (E_t − F_t) / E_(t−1) − 1, where F_t is the net cash flow
 * dated exactly t. `buildDailyEquity` books a flow into the equity of its own
 * date, so subtracting F_t strips the deposit out of the numerator and leaves
 * only the market move. Chaining Π(1 + r_t) makes the result independent of both
 * the size and the timing of every flow.
 *
 * The first period is measured against opening capital plus any flow dated
 * BEFORE the first snapshot — those are already inside E_0's cash.
 *
 * A period starting from non-positive equity (account emptied by a withdrawal)
 * has no meaningful return: it contributes r = 0 and the chain continues.
 */
export function computeTwr(state: AccountState): TwrResult {
  // One equity per date, last write wins, chronological.
  const byDate = new Map<string, number>();
  for (const s of state.snapshots ?? []) byDate.set(s.date, s.equity);
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return EMPTY;

  const flowOn = new Map<string, number>();
  for (const f of state.cashFlows ?? []) {
    flowOn.set(f.date, (flowOn.get(f.date) ?? 0) + f.amount);
  }

  const first = dates[0]!;
  let prev = state.account.initialCapital;
  for (const [date, amount] of flowOn) if (date < first) prev += amount;

  const points: TwrPoint[] = [];
  let index = 1;
  let peak = 1;
  let maxDd = 0;

  for (const date of dates) {
    const equity = byDate.get(date)!;
    const flow = flowOn.get(date) ?? 0;
    const r = prev > 0 ? (equity - flow) / prev - 1 : 0;
    index *= 1 + r;
    points.push({ date, index: pyRound(index, 10), periodReturn: pyRound(r, 10) });
    if (index > peak) peak = index;
    if (peak > 0) {
      const dd = ((peak - index) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
    prev = equity;
  }

  const days = daysBetween(first, dates[dates.length - 1]!);
  const annualized = days >= 1 && index > 0 ? (index ** (365 / days) - 1) * 100 : 0;

  return {
    points,
    totalPct: pyRound((index - 1) * 100, 6),
    annualizedPct: pyRound(annualized, 6),
    maxDrawdownPct: pyRound(maxDd, 6),
  };
}
