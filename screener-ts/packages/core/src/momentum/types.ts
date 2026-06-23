/** Result types for the momentum / regime / sector layer. Kept separate from the
 * parity-locked `types/signals.ts` and the `qm/` types so existing contracts are
 * untouched. */

export type MomentumClassification = 'Weak' | 'Building' | 'Strong' | 'Explosive';

export type RegimeType = 'BULL' | 'TRANSITION' | 'BEAR';

/** Multi-period returns (%) for one symbol. */
export interface MomentumReturns {
  oneMonth: number | null;
  threeMonth: number | null;
  sixMonth: number | null;
  twelveMonth: number | null;
}

/** F1 — momentum result for a single symbol. */
export interface MomentumResult {
  symbol: string;
  price: number;
  /** Weighted momentum score 0..100. */
  momentumScore: number;
  /** Percentile rank 0..100 within the scored set (filled by rankMomentum). */
  percentileRank: number;
  classification: MomentumClassification;
  returns: MomentumReturns;
  /** Relative strength vs benchmark (raw weighted return %, signed). */
  relativeStrength: number;
  /** Recent dollar volume (price × avg volume). */
  dollarVolume: number;
  /** ATR as a % of price. */
  atrPct: number;
  /** Distance below the 52-week high (%). */
  distanceFrom52wHighPct: number;
}

/** F2 — overall market regime. */
export interface MarketRegime {
  regimeType: RegimeType;
  /** 0..100 — how strongly the regime conditions hold. */
  strengthScore: number;
  riskOn: boolean;
  /** Sub-conditions, for transparency/UI. */
  price: number;
  ema50: number;
  ema150: number;
  ema200: number;
  aboveEma200: boolean;
  emaStacked: boolean;
  ema200Rising: boolean;
}

/** F3 — momentum stats for one sector. */
export interface SectorMomentum {
  sector: string;
  avgReturn1m: number;
  avgReturn3m: number;
  /** Average relative strength vs benchmark across the sector. */
  avgRelativeStrength: number;
  /** Count of the sector's stocks in the top-momentum percentile. */
  topMomentumCount: number;
  /** Number of the sector's stocks that were scored. */
  scored: number;
  rank: number;
}

/** F3 — the full sector-rotation report. */
export interface SectorMomentumReport {
  rankings: SectorMomentum[];
  hotSectors: string[];
  coldSectors: string[];
}

/** Flattened row for the Momentum exploration scan (F5/F6 columns). */
export interface MomentumRow {
  symbol: string;
  sector?: string | null;
  price: number;
  momentumScore: number;
  momentumPercentile: number;
  classification: MomentumClassification;
  return1m: number | null;
  return3m: number | null;
  return6m: number | null;
  relativeStrength: number;
  distanceFrom52wHighPct: number;
  atrPct: number;
  // Annotation columns (F6) — context, not gates.
  marketRegime: RegimeType | null;
  sectorRank: number | null;
  sectorStrength: number | null;
  isHotSector: boolean;
}
