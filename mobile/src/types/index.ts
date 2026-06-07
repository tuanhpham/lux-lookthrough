// ── API response types (mirror backend Pydantic schemas) ─────────────────────

export interface SectorVolume {
  sector: string;
  avg_volume_3m: number;
  avg_volume_6m: number;
  volume_change_pct: number;
  rank: number;
}

export interface TopStock {
  symbol: string;
  sector: string;
  volume_surge_pct: number;
  price_change_pct: number;
  current_price: number;
  avg_volume_20d: number;
  avg_volume_3m: number;
}

export type SignalType = "CONSOLIDATING" | "BREAKOUT_IMMINENT" | "NO_SIGNAL";

export interface PatternSignal {
  symbol: string;
  sector: string | null;
  stage: number;
  stage_label: string;
  score: number;
  signal: SignalType;
  entry_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
  risk_reward: number | null;
  vcp_contractions: number | null;
  atr_contraction_pct: number | null;
  price_range_pct: number | null;
  volume_dry_up_pct: number | null;
  pivot_high: number | null;
  days_in_base: number | null;
}

export interface SectorScanResult {
  sector: string;
  total_scanned: number;
  qualified: number;
  stocks: PatternSignal[];
}

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCVResponse {
  symbol: string;
  period: string;
  candles: Candle[];
}

// ── Navigation param lists ────────────────────────────────────────────────────

export type RootTabParamList = {
  Home: undefined;
  Patterns: undefined;
};

export type HomeStackParamList = {
  HomeScreen: undefined;
  SectorScreen: { sector: string };
  StockDetail: { symbol: string; sector?: string };
};

export type PatternStackParamList = {
  PatternScreen: undefined;
  StockDetail: { symbol: string; sector?: string };
};
