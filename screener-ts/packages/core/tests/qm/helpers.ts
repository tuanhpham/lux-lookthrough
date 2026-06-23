import type { Bar } from '../../src/types/market.js';

/** Sequential ISO trading dates starting 2020-01-01 (calendar days; fine for tests). */
export function isoDate(i: number): string {
  const d = new Date(Date.UTC(2020, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

/** Build a Bar from a close, deriving a plausible OHLC band and volume. */
export function bar(
  i: number,
  close: number,
  opts: { high?: number; low?: number; open?: number; volume?: number } = {},
): Bar {
  const open = opts.open ?? close;
  const high = opts.high ?? Math.max(open, close) * 1.005;
  const low = opts.low ?? Math.min(open, close) * 0.995;
  return {
    date: isoDate(i),
    open,
    high,
    low,
    close,
    volume: opts.volume ?? 1_000_000,
  };
}

/** A series of `n` bars from a close-price function. */
export function series(n: number, closeAt: (i: number) => number, volAt?: (i: number) => number): Bar[] {
  return Array.from({ length: n }, (_, i) => bar(i, closeAt(i), { volume: volAt?.(i) }));
}

/**
 * A clean uptrend that satisfies the trend filter: steadily rising closes so
 * price > EMA50 > EMA150 > EMA200, EMA200 rising, near the 52-week high, with
 * ample liquidity.
 */
export function uptrendSeries(n = 260, start = 50, slopePerBar = 0.5): Bar[] {
  return series(
    n,
    (i) => start + slopePerBar * i,
    () => 3_000_000,
  );
}
