import type { Bar } from '../types/market.js';
import type { PatternResult } from '../types/signals.js';
import { analyzeStage } from '../patterns/stage.js';
import { detectConsolidation } from '../patterns/consolidation.js';
import { detectPivot } from '../patterns/pivot.js';
import { atr } from '../indicators/atr.js';
import { computeScore } from './score.js';
import { generateSignal } from './signal.js';
import { calculateTradeLevels } from './tradeLevels.js';

/**
 * Full single-stock pattern scan — faithful port of `scan_stock`.
 *
 * current_atr = last non-NaN value of ATR(df, 14) (0 if none).
 * current_price = last close.
 */
export function scanStock(
  symbol: string,
  bars: readonly Bar[],
): PatternResult {
  const stage = analyzeStage(bars);
  const cons = detectConsolidation(bars);
  const pivot = detectPivot(bars);
  const score = computeScore(stage, cons, pivot);
  const signal = generateSignal(stage, cons, pivot, score);

  const atrSeries = atr(bars, 14).filter((v) => !Number.isNaN(v));
  const currentAtr = atrSeries.length > 0 ? atrSeries[atrSeries.length - 1]! : 0;
  const currentPrice = bars.length > 0 ? bars[bars.length - 1]!.close : 0;

  const levels = calculateTradeLevels(currentPrice, pivot.pivotHigh, currentAtr);

  return {
    symbol,
    stage,
    consolidation: cons,
    pivot,
    signal,
    score,
    entryPrice: levels.entryPrice,
    stopLoss: levels.stopLoss,
    targetPrice: levels.targetPrice,
    riskReward: levels.riskReward,
  };
}
