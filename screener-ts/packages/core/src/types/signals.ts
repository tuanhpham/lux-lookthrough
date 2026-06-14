/** Pattern-engine result types — mirror the Python dataclasses faithfully. */

export type SignalType = 'BREAKOUT_IMMINENT' | 'CONSOLIDATING' | 'NO_SIGNAL';

export type StageLabel =
  | 'ADVANCING'
  | 'TOPPING'
  | 'DECLINING'
  | 'BASING'
  | 'INSUFFICIENT_DATA';

export interface StageResult {
  stage: number; // 0=insufficient, 1=base, 2=advance, 3=top, 4=decline
  label: StageLabel;
  ma50: number;
  ma150: number;
  ma200: number;
  price: number;
  aboveMa50: boolean;
  aboveMa150: boolean;
  aboveMa200: boolean;
  ma200TrendingUp: boolean;
}

export interface ConsolidationResult {
  isConsolidating: boolean;
  daysInBase: number;
  priceRangePct: number;
  atrContractionPct: number;
  volumeDryUpPct: number;
  vcpContractions: number;
  tightestRangePct: number;
}

export interface PivotResult {
  pivotHigh: number | null;
  distanceToPivotPct: number;
  recentPivots: number[];
}

export interface TradeLevels {
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
}

export interface PatternResult {
  symbol: string;
  stage: StageResult;
  consolidation: ConsolidationResult;
  pivot: PivotResult;
  signal: SignalType;
  score: number;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
}

/** Flattened screener row (what the UI table consumes). */
export interface ScreenRow {
  symbol: string;
  sector?: string | null;
  stage: number;
  stageLabel: StageLabel;
  price: number;
  score: number;
  signal: SignalType;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
  pivotHigh: number | null;
  distanceToPivotPct: number | null;
  priceRangePct: number | null;
  atrContractionPct: number | null;
  volumeDryUpPct: number | null;
  vcpContractions: number | null;
  daysInBase: number | null;
}
