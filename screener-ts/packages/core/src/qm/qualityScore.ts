import type { QmQualityParts } from './types.js';
import { DEFAULT_QM_CONFIG, type QmConfig } from './config.js';
import { pyRound } from '../util/round.js';

/**
 * F4 — weighted quality score 0..100.
 *
 * Each part of `QmQualityParts` is a 0..1 strength; it is multiplied by its
 * configurable weight (cfg.weights) and summed. With default weights the maxima
 * are Trend 20, Previous Advance 10, VCP 25, Volume 15, RS 15, Liquidity 10,
 * Breakout 5 (total 100). All weights are configurable, so changing them shifts
 * the total linearly.
 */
export function computeQmQuality(
  parts: QmQualityParts,
  cfg: QmConfig = DEFAULT_QM_CONFIG,
): number {
  const w = cfg.weights;
  const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

  const total =
    clamp01(parts.trend) * w.trend +
    clamp01(parts.previousAdvance) * w.previousAdvance +
    clamp01(parts.vcp) * w.vcp +
    clamp01(parts.volume) * w.volume +
    clamp01(parts.relativeStrength) * w.relativeStrength +
    clamp01(parts.liquidity) * w.liquidity +
    clamp01(parts.breakout) * w.breakout;

  return pyRound(total, 1);
}
