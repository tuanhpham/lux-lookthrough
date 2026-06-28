import type { MomentumResult, MomentumRow, MarketRegime, SectorMomentum } from './types.js';

/**
 * Flatten a MomentumResult into a UI/report row, optionally annotated with the
 * market regime and the symbol's sector rank (F6). Annotation context is
 * passed in (regime + the sector's rank/strength + hot flag) rather than
 * recomputed, keeping this a pure mapping.
 */
export function momentumToRow(
  r: MomentumResult,
  opts: {
    sector?: string | null;
    regime?: MarketRegime | null;
    sector_?: SectorMomentum | null;
    isHotSector?: boolean;
  } = {},
): MomentumRow {
  return {
    symbol: r.symbol,
    sector: opts.sector ?? null,
    price: r.price,
    momentumScore: r.momentumScore,
    momentumPercentile: r.percentileRank,
    classification: r.classification,
    return1m: r.returns.oneMonth,
    return3m: r.returns.threeMonth,
    return6m: r.returns.sixMonth,
    relativeStrength: r.relativeStrength,
    distanceFrom52wHighPct: r.distanceFrom52wHighPct,
    atrPct: r.atrPct,
    marketRegime: opts.regime?.regimeType ?? null,
    sectorRank: opts.sector_?.rank ?? null,
    sectorStrength: opts.sector_?.avgRelativeStrength ?? null,
    isHotSector: opts.isHotSector ?? false,
  };
}
