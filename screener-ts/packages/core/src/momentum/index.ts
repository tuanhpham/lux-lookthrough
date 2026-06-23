// Barrel for the momentum / regime / sector layer.
export { DEFAULT_MOMENTUM_CONFIG } from './config.js';
export type {
  MomentumConfig,
  MomentumReturnPeriods,
  MomentumWeights,
  MomentumNormalization,
  MomentumClassificationCutoffs,
  SectorMomentumConfig,
  RegimeConfig,
  MomentumFilterConfig,
} from './config.js';
export type {
  MomentumClassification,
  RegimeType,
  MomentumReturns,
  MomentumResult,
  MarketRegime,
  SectorMomentum,
  SectorMomentumReport,
  MomentumRow,
} from './types.js';
export {
  computeReturns,
  computeMomentumScore,
  classifyMomentum,
  rankMomentum,
} from './momentumEngine.js';
export { detectRegime } from './marketRegime.js';
export { computeSectorMomentum } from './sectorMomentum.js';
export { filterByMomentum } from './momentumFilter.js';
export type { MomentumFilterOptions, MomentumFilterResult } from './momentumFilter.js';
export { momentumToRow } from './momentumRow.js';
