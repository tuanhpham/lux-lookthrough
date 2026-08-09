/**
 * Wilder's Relative Strength Index.
 *
 * Seeded with the simple average of the first `period` gains/losses, then
 * smoothed with Wilder's recursion (the standard RSI — NOT an EMA with
 * k = 2/(period+1), which gives visibly different values and is the usual way
 * this indicator gets implemented wrong).
 *
 * Alignment follows the rest of `indicators/`: the returned array matches the
 * input length and the first `period` entries are NaN. Gains/losses are only
 * defined from bar 1 onwards, so the first real reading lands at index
 * `period` — one later than `ema`/`atr`, which is deliberate and must not be
 * "fixed" by shifting, or every RSI reading would be off by a bar.
 *
 * A window with no losses returns 100 (not Infinity) and one with no gains
 * returns 0, so callers can compare against thresholds without guarding.
 */
export function rsi(values: readonly number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i]! - values[i - 1]!;
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFrom(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i]! - values[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    // Wilder smoothing: previous average carries (period − 1)/period weight.
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  // No losses in the window → RSI 100. Returning Infinity here (via RS = g/0)
  // would poison every downstream comparison, so it is pinned to the bound.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Convenience: RSI of bar closes. */
export function rsiOfCloses(bars: readonly { close: number }[], period = 14): number[] {
  return rsi(
    bars.map((b) => b.close),
    period,
  );
}
