import type { QmRow, QmScanResult } from './types.js';

/** Flatten a QmScanResult into a QM table row (analogous to `patternToRow`). */
export function qmToRow(r: QmScanResult, sector: string | null = null): QmRow {
  return {
    symbol: r.symbol,
    sector,
    price: r.price,
    qualityScore: r.qualityScore,
    setupType: r.setupType,
    previousAdvancePct: r.vcp.previousAdvancePct,
    vcpContractions: r.vcp.contractions,
    atrContractionPct: r.vcp.atrContractionPct,
    volumeContractionPct: r.vcp.volumeContractionPct,
    pivot: r.vcp.pivot,
    entryPrice: r.levels.entryPrice,
    stopLoss: r.levels.stopLoss,
    riskPct: r.riskPct,
    relativeStrength: r.relativeStrength,
    gapPct: r.ep.isEp ? r.ep.gapPct : null,
    catalyst: r.ep.catalyst,
  };
}
