/**
 * The trade plan for one symbol, one price, one date — the arithmetic the Trade Station and
 * the quick plan cards share, so the letter and the size are the same wherever they are read.
 *
 * ── TWO PASSES, THE BUY FORM'S ORDER ────────────────────────────────────────
 * Levels first with no grade (the checklist's R:R and stop-width criteria describe THIS
 * trade's stop and target), then the checklist scored against them, then the size with the
 * letter that came out. A stop or target the caller already has is kept, never replaced.
 *
 * ── A PAST DATE IS A PAST CHART ─────────────────────────────────────────────
 * The Trade Planner's time travel, carried over: when the date is before the last bar, the
 * scan, the levels and the grade see only the bars up to and including that date, and the
 * market regime is that date's. The account (equity, cash, open risk) cannot be replayed —
 * it is today's — which the callers say on screen.
 */
import type { AccountState, Bar, ConvictionRating, GradeResult, SetupKey } from '@screener/core';
import { gradeTrade, qmGradeEvidence, scanQm } from '@screener/core';
import { buildBuyPlan, currentRegime, regimeAsOf, type BuyPlan } from './playbook.js';
import { accountPrices } from './prices.js';
import type { SymbolPlan } from './planStore.js';

/** True when `date` is before the last bar — the plan is reconstructed, not live. */
export function isPast(bars: readonly Bar[], date: string): boolean {
  const last = bars[bars.length - 1]?.date;
  return !!last && date < last;
}

/** The bars as they existed after the close of `date`. */
export function barsAsOf(bars: readonly Bar[], date: string): Bar[] {
  return isPast(bars, date) ? bars.filter((b) => b.date <= date) : (bars as Bar[]);
}

/** History to fetch so that a past date still has a full year before it. */
export function periodFor(date: string, today: string): '1y' | '2y' | '5y' | 'max' {
  const days = (new Date(today + 'T00:00:00').getTime() - new Date(date + 'T00:00:00').getTime()) / 864e5;
  return days < 120 ? '1y' : days < 450 ? '2y' : days < 1500 ? '5y' : 'max';
}

export interface PlanInput {
  state: AccountState;
  /** Raw bars, in the quote currency, as fetched. Sliced here, never by the caller. */
  bars: readonly Bar[];
  symbol: string;
  plan: SymbolPlan | null;
  /** Entry, in `ccy`. */
  price: number;
  ccy: 'EUR' | 'USD';
  date: string;
  setup: SetupKey | '';
  stop: number | null;
  target: number | null;
}

export interface PlanOut {
  stop: number | null;
  target: number | null;
  grade: GradeResult | null;
  /** The override, else the score's letter. */
  effective: ConvictionRating | null;
  /** Size at the graded letter (falls back to the ungraded pass). */
  sized: BuyPlan | null;
  past: boolean;
}

const scans = new Map<string, ReturnType<typeof scanQm> | null>();

/** The scan of the bars up to `date`, cached — it is the expensive part. */
function scanFor(symbol: string, bars: readonly Bar[]): ReturnType<typeof scanQm> | null {
  const key = `${symbol}:${bars.length}:${bars[bars.length - 1]?.date ?? ''}`;
  if (!scans.has(key)) {
    if (scans.size > 60) scans.clear();
    scans.set(key, bars.length >= 60 ? scanQm(symbol, bars as Bar[]) : null);
  }
  return scans.get(key) ?? null;
}

export function computePlan(i: PlanInput): PlanOut {
  const past = isPast(i.bars, i.date);
  const bars = barsAsOf(i.bars, i.date);
  if (!bars.length || !(i.price > 0)) {
    return { stop: i.stop, target: i.target, grade: null, effective: (i.plan?.gradeOverride ?? null) as ConvictionRating | null, sized: null, past };
  }
  const common = {
    state: i.state, prices: accountPrices(i.state.account.id), bars, symbol: i.symbol,
    entry: i.price, entryCurrency: i.ccy, setup: (i.setup || 'Breakout') as SetupKey, date: i.date,
    ...(past ? { asOfRegime: true } : {}),
  };
  const lv = buildBuyPlan({ ...common, rating: null });
  const stop = i.stop ?? lv?.stop ?? null;
  const target = i.target ?? lv?.target ?? null;

  let grade: GradeResult | null = null;
  const scan = scanFor(i.symbol, bars);
  if (scan && i.plan) {
    const rps = stop !== null && stop > 0 && stop < i.price ? i.price - stop : 0;
    const rg = past ? regimeAsOf(i.date) : currentRegime();
    grade = gradeTrade(qmGradeEvidence(scan, {
      setup: i.setup,
      regime: rg?.regime ?? null,
      // null, not 0, when there is nothing to divide: the grader reads a missing number as
      // unmeasured and a zero as a failing measurement.
      rMultiple: rps > 0 && target !== null && target > i.price ? (target - i.price) / rps : null,
      stopPct: rps > 0 ? (rps / i.price) * 100 : null,
    }), i.plan.answers);
  }
  const effective = (i.plan?.gradeOverride ?? grade?.grade ?? null) as ConvictionRating | null;
  const sized = buildBuyPlan({ ...common, rating: effective }) ?? lv;
  return { stop, target, grade, effective, sized, past };
}
