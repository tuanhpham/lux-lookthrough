import type { Bar } from '../types/market.js';
import { emaOfCloses } from '../indicators/ema.js';
import { pyRound } from '../util/round.js';

/**
 * "Surge" screen — fresh, fast movers holding their short-term trend.
 *
 * Two conditions, both configurable:
 *   1. The close has stayed AT OR ABOVE its EMA5 on every one of the last
 *      `aboveEmaDays` bars (≈ one trading week) — no daily close has broken the
 *      5-day trend.
 *   2. The price has risen more than `minGainPct` over the last `gainLookback`
 *      bars (≈ two trading weeks).
 *
 * Reuses `emaOfCloses` and `pyRound`; no new indicator math.
 */
export interface SurgeConfig {
  /** EMA period the close must stay above (default 5). */
  emaPeriod: number;
  /** Number of trailing bars that must all close ≥ EMA5 (≈1 week → 5). */
  aboveEmaDays: number;
  /** Minimum return (%) over the gain window (default 20). */
  minGainPct: number;
  /** Bars over which the gain is measured (≈2 weeks → 10). */
  gainLookback: number;
}

export const DEFAULT_SURGE_CONFIG: SurgeConfig = {
  emaPeriod: 5,
  aboveEmaDays: 5,
  minGainPct: 20,
  gainLookback: 10,
};

export interface SurgeResult {
  isSurge: boolean;
  /** Whether every one of the last `aboveEmaDays` closes was ≥ EMA5. */
  aboveEma: boolean;
  /** Return over the gain window (%). */
  gainPct: number;
  /** How many of the last `aboveEmaDays` closes were ≥ EMA5 (for transparency). */
  daysAboveEma: number;
}

const EMPTY: SurgeResult = { isSurge: false, aboveEma: false, gainPct: 0, daysAboveEma: 0 };

export function detectSurge(
  bars: readonly Bar[],
  cfg: SurgeConfig = DEFAULT_SURGE_CONFIG,
): SurgeResult {
  const n = bars.length;
  // Need enough history for a defined EMA5 across the whole check window plus
  // the 2-week gain lookback.
  if (n < Math.max(cfg.emaPeriod + cfg.aboveEmaDays, cfg.gainLookback + 1)) return EMPTY;

  const ema = emaOfCloses(bars, cfg.emaPeriod);

  // Condition 1: every one of the last `aboveEmaDays` closes ≥ its EMA5.
  let daysAboveEma = 0;
  for (let i = n - cfg.aboveEmaDays; i < n; i++) {
    const e = ema[i]!;
    if (!Number.isNaN(e) && bars[i]!.close >= e) daysAboveEma += 1;
  }
  const aboveEma = daysAboveEma === cfg.aboveEmaDays;

  // Condition 2: > minGainPct over the gain lookback.
  const now = bars[n - 1]!.close;
  const then = bars[n - 1 - cfg.gainLookback]!.close;
  const gainPct = then > 0 ? pyRound(((now - then) / then) * 100, 2) : 0;

  return {
    isSurge: aboveEma && gainPct > cfg.minGainPct,
    aboveEma,
    gainPct,
    daysAboveEma,
  };
}
