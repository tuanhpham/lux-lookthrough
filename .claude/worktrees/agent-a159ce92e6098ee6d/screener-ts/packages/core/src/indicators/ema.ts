/**
 * Exponential moving average over a value series, seeded with the simple
 * average of the first `period` values — matching the web dashboard's
 * `computeEMA` (used for chart overlays: EMA 5/10/21/50/150/200).
 *
 * Returns an array aligned to the input where the first `period - 1` entries
 * are NaN (no EMA defined yet).
 */
export function ema(values: readonly number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Convenience: EMA of bar closes. */
export function emaOfCloses(
  bars: readonly { close: number }[],
  period: number,
): number[] {
  return ema(
    bars.map((b) => b.close),
    period,
  );
}
