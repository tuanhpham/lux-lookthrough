/**
 * Python-compatible `round(value, ndigits)`.
 *
 * CPython uses round-half-to-even ("banker's rounding"). The Python pattern
 * engine rounds many intermediate values (MAs, percentages) to 2 dp and the
 * final score to 1 dp, and those rounded values feed forward into later
 * calculations — so to preserve parity we must round at the same points with
 * the same rule.
 */
export function pyRound(value: number, ndigits = 0): number {
  if (!Number.isFinite(value)) return value;
  const m = 10 ** ndigits;
  const scaled = value * m;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const eps = 1e-9;
  let rounded: number;
  if (Math.abs(diff - 0.5) < eps) {
    // Exact .5 tie → round to even.
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  // Avoid -0 and trailing float noise.
  const result = rounded / m;
  return result === 0 ? 0 : result;
}
