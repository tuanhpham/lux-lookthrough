import type { Bar } from '../types/market.js';

/**
 * True Range series, matching the Python pandas fallback:
 *
 *   prev_close = close.shift(1)
 *   tr = max( high-low, |high-prev_close|, |low-prev_close| )   (NaN-skipping max)
 *
 * For bar 0 prev_close is NaN, so the two close-based terms are NaN and the
 * NaN-skipping max collapses to (high - low).
 */
export function trueRange(bars: readonly Bar[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const hl = b.high - b.low;
    if (i === 0) {
      out.push(hl);
      continue;
    }
    const prevClose = bars[i - 1]!.close;
    out.push(Math.max(hl, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose)));
  }
  return out;
}

/**
 * ATR = simple rolling mean of True Range over `period`.
 *
 * Matches the Python pandas fallback `tr.rolling(period).mean()` that the
 * reference engine actually runs (TA-Lib is not installed). The first
 * `period - 1` entries are NaN, exactly like pandas, because downstream code
 * slices and `dropna()`s in ways that depend on those NaN positions.
 */
export function atr(bars: readonly Bar[], period = 14): number[] {
  const tr = trueRange(bars);
  const out = new Array<number>(tr.length).fill(NaN);
  if (tr.length < period) return out;
  let windowSum = 0;
  for (let i = 0; i < tr.length; i++) {
    windowSum += tr[i]!;
    if (i >= period) windowSum -= tr[i - period]!;
    if (i >= period - 1) out[i] = windowSum / period;
  }
  return out;
}
