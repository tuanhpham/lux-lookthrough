// Barrel for the Qullamaggie screening module.
export { DEFAULT_QM_CONFIG } from './config.js';
export type {
  QmConfig,
  QmTrendConfig,
  QmVcpConfig,
  QmEpConfig,
  QmWeights,
  QmRsConfig,
} from './config.js';
export type {
  TrendFilterResult,
  VcpResult,
  EpisodicPivotResult,
  QmQualityParts,
  QmScanResult,
  QmRow,
  QmSetupType,
} from './types.js';
export { trendFilter } from './trend.js';
export { detectVcp } from './vcp.js';
export { detectEpisodicPivot } from './episodicPivot.js';
export type { EpSurprise } from './episodicPivot.js';
export { relativeStrength } from './relativeStrength.js';
export { computeQmQuality } from './qualityScore.js';
export { scanQm } from './scanQm.js';
export type { QmScanOptions } from './scanQm.js';
export { qmToRow } from './qmRow.js';
