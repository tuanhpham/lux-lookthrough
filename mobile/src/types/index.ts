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

// ── Fundamentals & financial history ─────────────────────────────────────────

export interface Fundamentals {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  industry?: string | null;
  market_cap?: number | null;
  pe_ratio?: number | null;
  eps?: number | null;
  roe?: number | null;
  profit_margin?: number | null;
  revenue_growth?: number | null;
  beta?: number | null;
  dividend_yield?: number | null;
  week52_high?: number | null;
  week52_low?: number | null;
  current_price?: number | null;
  summary?: string | null;
  website?: string | null;
}

export interface FinancialPoint {
  period: string;
  revenue: number | null;
  net_income: number | null;
  eps: number | null;
}

export interface FinancialsResponse {
  symbol: string;
  annual: FinancialPoint[];
  quarterly: FinancialPoint[];
}

// ── Screener ──────────────────────────────────────────────────────────────────

export interface ScreenRequest {
  symbols?: string[] | null;
  sectors?: string[] | null;
  min_score?: number;
  signals?: string[] | null;
  stages?: number[] | null;
  sort_by?: string;
  descending?: boolean;
  limit?: number;
  period?: string;
}

export interface ScreenRow {
  symbol: string;
  stage: number;
  stage_label: string;
  price: number;
  score: number;
  signal: SignalType;
  entry_price: number | null;
  stop_loss: number | null;
  target_price: number | null;
  risk_reward: number | null;
  pivot_high: number | null;
  distance_to_pivot_pct: number | null;
  price_range_pct: number | null;
  atr_contraction_pct: number | null;
  volume_dry_up_pct: number | null;
  vcp_contractions: number | null;
  days_in_base: number | null;
}

export interface ScreenResponse {
  universe: number;
  scanned: number;
  matched: number;
  results: ScreenRow[];
}

// ── Watchlists (named collections) ───────────────────────────────────────────

export interface WatchlistItem {
  id: number;
  symbol: string;
  note?: string | null;
  watchlist_id?: number | null;
}

export interface WatchlistCollection {
  id: number;
  name: string;
  count: number;
  items: WatchlistItem[];
}

// ── Navigation param lists ────────────────────────────────────────────────────

export type RootTabParamList = {
  Home: undefined;
  Screener: undefined;
  Watchlists: undefined;
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

export type ScreenerStackParamList = {
  ScreenerScreen: undefined;
  StockDetail: { symbol: string; sector?: string };
};

export type WatchlistStackParamList = {
  WatchlistScreen: undefined;
  StockDetail: { symbol: string; sector?: string };
};
