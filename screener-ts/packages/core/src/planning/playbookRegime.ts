/**
 * The market regime the swing playbook is written against.
 *
 * ── WHY A SECOND REGIME FUNCTION EXISTS ─────────────────────────────────────
 * `momentum/marketRegime.ts` already classifies the tape, but into three states
 * (BULL / TRANSITION / BEAR) from a QQQ EMA stack. The playbook's sizing ladder is
 * indexed by a DIFFERENT four-state scheme computed from SPY against its 50/200-day
 * averages plus the slope of the 50. Mapping three onto four would mean inventing
 * the missing distinction — and the one that goes missing is exactly the one the
 * ladder cares about: `UPTREND_UNDER_STRESS` (50MA still above 200MA but price has
 * lost the 50MA) is half size, while `RANGE` unlocks a different set of setups.
 *
 * So this is not a duplicate. `detectRegime` answers "is the tape risk-on for the
 * momentum screens"; this answers "which page of the playbook am I allowed to trade
 * today, and at what size". They are allowed to disagree.
 *
 * ── WHY SMA AND NOT EMA ─────────────────────────────────────────────────────
 * The playbook says 50MA/200MA and every chart a reader will compare this against
 * (TradingView's default, Stockcharts, the financial press) means the simple average.
 * An EMA here would put the app a few tenths of a percent away from what the user
 * sees elsewhere, right at the boundary where the classification flips.
 *
 * ── WHY IT CAN RETURN null ──────────────────────────────────────────────────
 * A 200-day average plus a 10-session slope needs 210 bars. With fewer, the honest
 * answer is "unknown" — not RANGE. RANGE is a real state that halves position size;
 * handing it back for "I have no data" would silently size every trade at half while
 * the screen says the tape is a range.
 */
import { atr } from '../indicators/atr.js';
import { mean } from '../indicators/rolling.js';
import type { Bar } from '../types/market.js';
import { pyRound } from '../util/round.js';

export type PlaybookRegime = 'UPTREND' | 'UPTREND_UNDER_STRESS' | 'RANGE' | 'DOWNTREND';

/** Bars needed before a regime can be named at all: 200 for the MA, 10 for its slope. */
export const REGIME_MIN_BARS = 210;

/** Sessions the 50MA slope is measured over. */
const SLOPE_LOOKBACK = 10;

/** Percent move of the 50MA over `SLOPE_LOOKBACK` that counts as sloping, not flat. */
const SLOPE_FLAT_PCT = 0.5;

/** Sessions the ATR% is averaged over to decide what "normal volatility" is here. */
const ATR_BASELINE = 100;

/** Above this ratio the tape is "expanded volatility" and the ladder halves size. */
export const ATR_EXPANDED = 1.3;

export interface RegimeRead {
  regime: PlaybookRegime;
  /** Date of the last bar the read is based on. */
  asOf: string;
  close: number;
  ma50: number;
  ma200: number;
  /** 50MA now vs the 50MA ten sessions ago, in percent. Above +0.5 is up. */
  slope50Pct: number;
  /**
   * Today's ATR% divided by its own 100-session average. 1 = as usual for this
   * market, `> ATR_EXPANDED` = the same 1% of risk now buys fewer shares.
   *
   * null when there is no 100-session baseline yet. A missing ratio must NOT read
   * as 1.0: that would quietly grant full size in a tape nobody has measured.
   */
  atrRatio: number | null;
}

function smaLast(values: readonly number[], period: number, endIdx: number): number {
  return mean(values.slice(endIdx - period + 1, endIdx + 1));
}

/**
 * Classify the tape from index bars (SPY), or null when there is not enough history.
 *
 * The order of the branches is the playbook's, and it matters: a flat 50MA with
 * price oscillating around it is a RANGE even while the 50 sits above the 200, which
 * is why the slope test guards UPTREND rather than the stack alone.
 */
export function detectPlaybookRegime(bars: readonly Bar[]): RegimeRead | null {
  if (bars.length < REGIME_MIN_BARS) return null;

  const closes = bars.map((b) => b.close);
  const i = closes.length - 1;
  const close = closes[i]!;
  const ma50 = smaLast(closes, 50, i);
  const ma200 = smaLast(closes, 200, i);
  const ma50Then = smaLast(closes, 50, i - SLOPE_LOOKBACK);
  if (!(ma50 > 0) || !(ma200 > 0) || !(ma50Then > 0)) return null;

  const slope50Pct = (ma50 / ma50Then - 1) * 100;

  let regime: PlaybookRegime;
  if (close > ma50 && close > ma200 && slope50Pct > SLOPE_FLAT_PCT) regime = 'UPTREND';
  else if (close < ma50 && close < ma200 && slope50Pct < -SLOPE_FLAT_PCT) regime = 'DOWNTREND';
  else if (ma50 > ma200 && close < ma50 && slope50Pct > SLOPE_FLAT_PCT) {
    // The slope test is here for the same reason it guards UPTREND: without it, a
    // market that rose for a year and has since gone flat gets called "an uptrend
    // under stress" every single day price closes a hair under a dead-flat 50MA.
    // That is chop, and the playbook trades chop differently (mean reversion becomes
    // available, breakouts stop working). "Under stress" means the advance is still
    // in force — 50 above 200 AND still rising — and price has just lost it.
    regime = 'UPTREND_UNDER_STRESS';
  }
  else regime = 'RANGE';

  return {
    regime,
    asOf: bars[i]!.date,
    close: pyRound(close, 2),
    ma50: pyRound(ma50, 2),
    ma200: pyRound(ma200, 2),
    slope50Pct: pyRound(slope50Pct, 2),
    atrRatio: atrRatioOf(bars),
  };
}

/**
 * ATR% against its own recent average — the "how many shares does 1% buy today"
 * question, asked separately so a caller with only one symbol's bars can ask it.
 *
 * Returns null rather than 1 when the baseline is missing; see `RegimeRead.atrRatio`.
 */
export function atrRatioOf(bars: readonly Bar[], period = 14): number | null {
  if (bars.length < period + ATR_BASELINE) return null;
  const a = atr(bars, period);
  const pct: number[] = [];
  for (let j = 0; j < bars.length; j++) {
    const v = a[j];
    const c = bars[j]!.close;
    if (v === undefined || Number.isNaN(v) || !(c > 0)) continue;
    pct.push((v / c) * 100);
  }
  if (pct.length < ATR_BASELINE) return null;
  const today = pct[pct.length - 1]!;
  const baseline = mean(pct.slice(-ATR_BASELINE));
  if (!(baseline > 0)) return null;
  return pyRound(today / baseline, 3);
}
