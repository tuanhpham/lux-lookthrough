/** Plain-array rolling helpers used by the pattern engine. */

/** Arithmetic mean of a slice; NaN for an empty slice (matches pandas .mean()). */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/**
 * Rolling window reducer producing an array aligned to input, with the first
 * `window - 1` entries set to NaN (pandas `.rolling(window)` semantics).
 */
export function rolling(
  values: readonly number[],
  window: number,
  reducer: (slice: number[]) => number,
): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (window <= 0) return out;
  for (let i = window - 1; i < values.length; i++) {
    out[i] = reducer(values.slice(i - window + 1, i + 1));
  }
  return out;
}

export function rollingMax(values: readonly number[], window: number): number[] {
  return rolling(values, window, (s) => Math.max(...s));
}

export function rollingMin(values: readonly number[], window: number): number[] {
  return rolling(values, window, (s) => Math.min(...s));
}
