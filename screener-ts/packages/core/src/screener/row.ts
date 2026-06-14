import type { PatternResult, ScreenRow } from '../types/signals.js';

/** Flatten a PatternResult into a screener table row (mirrors `_result_to_schema`). */
export function patternToRow(
  r: PatternResult,
  sector: string | null = null,
): ScreenRow {
  return {
    symbol: r.symbol,
    sector,
    stage: r.stage.stage,
    stageLabel: r.stage.label,
    price: r.stage.price,
    score: r.score,
    signal: r.signal,
    entryPrice: r.entryPrice,
    stopLoss: r.stopLoss,
    targetPrice: r.targetPrice,
    riskReward: r.riskReward,
    pivotHigh: r.pivot.pivotHigh,
    distanceToPivotPct: r.pivot.distanceToPivotPct,
    priceRangePct: r.consolidation.priceRangePct,
    atrContractionPct: r.consolidation.atrContractionPct,
    volumeDryUpPct: r.consolidation.volumeDryUpPct,
    vcpContractions: r.consolidation.vcpContractions,
    daysInBase: r.consolidation.daysInBase,
  };
}
