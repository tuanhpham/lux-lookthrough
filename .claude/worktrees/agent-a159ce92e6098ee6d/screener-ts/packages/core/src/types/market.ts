/** Market data types. A `Bar` is one OHLCV candle; dates are ISO `YYYY-MM-DD`. */

export type Period = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max';

export interface Bar {
  date: string; // ISO YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** OHLCV series for one symbol. Bars MUST be sorted ascending by date. */
export interface OHLCV {
  symbol: string;
  bars: Bar[];
}

export interface Fundamentals {
  symbol: string;
  name?: string | null;
  shortName?: string | null;
  sector?: string | null;
  industry?: string | null;
  marketCap?: number | null;
  peRatio?: number | null;
  forwardPe?: number | null;
  eps?: number | null;
  forwardEps?: number | null;
  dividendYield?: number | null;
  beta?: number | null;
  week52High?: number | null;
  week52Low?: number | null;
  avgVolume?: number | null;
  profitMargin?: number | null;
  revenueGrowth?: number | null;
  roe?: number | null;
  currency?: string | null;
  website?: string | null;
  summary?: string | null;
  currentPrice?: number | null;
}

export interface FinancialPoint {
  period: string; // ISO date of the statement period end
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
}

export interface Financials {
  symbol: string;
  annual: FinancialPoint[];
  quarterly: FinancialPoint[];
}

export interface SectorVolumePoint {
  date: string;
  volume: number;
}

export interface SectorVolumeSeries {
  sector: string;
  freq: 'weekly' | 'monthly';
  period?: Period;
  points: SectorVolumePoint[];
}

export interface SectorRank {
  sector: string;
  avgVolume3m: number;
  avgVolume6m: number;
  volumeChangePct: number;
  rank: number;
}
