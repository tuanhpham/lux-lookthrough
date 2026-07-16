/** Paper-trading domain types. All money is in the account's `currency`. */

import type { SignalType } from './signals.js';

export interface Account {
  id: string;
  name: string;
  description?: string;
  initialCapital: number;
  currency: string; // e.g. 'EUR'
  createdAt: string; // ISO date
}

/** A purchase. `remainingShares` shrinks as FIFO sells consume it. */
export interface BuyLot {
  id: string;
  accountId: string;
  ticker: string;
  buyDate: string;
  buyPrice: number;
  shares: number;
  remainingShares: number;
  /** Free-form rich-text (HTML) note about this purchase. */
  reason?: string;
  signal?: SignalType;
  /** Subjective A–D grade of the setup quality. Optional. */
  rating?: 'A' | 'B' | 'C' | 'D';
  /** Setup type this buy was taken on (e.g. "VCP", "Episodic Pivot"). Optional. */
  setupType?: string;
  stop?: number; // OPTIONAL — when unset, risk is "undefined" and excluded from total risk
  target?: number;
  priceCurrency?: 'EUR' | 'USD'; // currency in which buyPrice was entered; defaults to USD
  fxRateAtBuy?: number;          // EURUSD rate at time of purchase (used for EUR account normalization)
}

/** A realized (partial or full) sale matched against a single lot. */
export interface SellRecord {
  id: string;
  accountId: string;
  ticker: string;
  lotId: string;
  sellDate: string;
  sellPrice: number;
  shares: number;
  realizedPnL: number;
  priceCurrency?: 'EUR' | 'USD';
  fxRateAtSell?: number; // EURUSD rate at time of sale
  /** Free-form rich-text (HTML) note about this sale. */
  note?: string;
}

export type OrderType = 'BUY_STOP' | 'STOP_LOSS' | 'TAKE_PROFIT';
export type OrderStatus = 'pending' | 'filled' | 'cancelled';

export interface Order {
  id: string;
  accountId: string;
  ticker: string;
  type: OrderType;
  threshold: number;
  shares: number;
  status: OrderStatus;
  createdDate: string;
  filledDate?: string;
  filledPrice?: number;
  /** Human-readable note — e.g. the insufficient-cash rejection reason. */
  note?: string;
  /** For STOP_LOSS/TAKE_PROFIT: the lot this order protects (optional). */
  lotId?: string;
}

/** A dated cash deposit (+) or withdrawal (−) in the account currency. */
export interface CashFlow {
  id: string;
  accountId: string;
  date: string;   // ISO YYYY-MM-DD
  amount: number; // + deposit, − withdrawal
  note?: string;
}

export interface EquitySnapshot {
  date: string;
  equity: number;
  cash: number;
  positionsValue: number;
}

/** Derived per-ticker position — never persisted stale; recomputed from lots. */
export interface Position {
  ticker: string;
  shares: number;
  avgCost: number;
  lastPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  realizedPnL: number;
  stop?: number;
  target?: number;
  riskEur?: number; // undefined when no stop is set; 0 when stop locks in profit (risk-free)
  /** True when a stop exists but sits at/above entry — capital is no longer at risk. */
  riskFree?: boolean;
  /** Profit guaranteed by the stop when risk-free = Σ (stop - buyPrice) * shares. */
  lockedInProfit?: number;
  distanceToStopPct?: number;
  distanceToTargetPct?: number;
  rMultiple?: number;
  daysHeld: number;
  concentrationPct: number; // % of account equity in this ticker
}

/** Whole-account roll-up of cash, PnL, and risk metrics. */
export interface AccountMetrics {
  accountId: string;
  cash: number;
  positionsValue: number;
  equity: number;
  initialCapital: number;
  totalPnL: number;
  totalPnLPct: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalOpenRiskEur: number; // sum of defined per-position risks
  totalOpenRiskPct: number; // as % of equity
  openPositionsWithoutStop: number;
  maxDrawdownPct: number;
  winRate: number; // 0..1 over closed trades
  avgRMultiple: number;
  expectancy: number; // average realized PnL per closed trade
  openTradeCount: number;
  closedTradeCount: number;
}

/** A complete persisted account state (lots + sells + orders + snapshots). */
export interface AccountState {
  account: Account;
  lots: BuyLot[];
  sells: SellRecord[];
  orders: Order[];
  snapshots: EquitySnapshot[];
  /** Dated cash deposits/withdrawals after opening. Optional for back-compat:
   * legacy/synced accounts without this field behave as if it were empty. */
  cashFlows?: CashFlow[];
}
