/** Paper-trading domain types. All money is in the account's `currency`. */

import type { SignalType } from './signals.js';

export interface Account {
  id: string;
  name: string;
  description?: string;
  initialCapital: number;
  currency: string; // e.g. 'EUR'
  createdAt: string; // ISO date
  /**
   * The broker's flat fee per order, in the account's currency (Trade Republic 1, Scalable
   * 0.99, Degiro 2, Equate Plus 0). Absent = 0. Only a DEFAULT: each fill stores the fee it
   * actually paid (`BuyLot.fee` / `SellRecord.fee`), so changing this later restates nothing.
   */
  fee?: number;
  /**
   * This account's own risk per trade, in % of its equity — a RISK PROFILE (CHAT-101: "moi tai
   * khoan … se co nhung muc risk khac nhau de cuoi cung so sanh xem muc nao hoat dong hieu qua
   * hon"). Absent = the playbook's (its ladder, or its pinned percent). Like a pinned percent it
   * does not overrule "no new longs in a downtrend", and the grade still scales the result.
   */
  riskPct?: number;
  /** This account's cap on one position, in % of equity. Absent = the playbook's. */
  maxPositionPct?: number;
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
  /** Fee paid on this buy, in the account's currency. Leaves cash; absent = 0. */
  fee?: number;
  /** Reserved for short selling, which the app does not do yet. Absent = 'long'. */
  side?: 'long' | 'short';
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
  /**
   * WHY the position was closed, as a key from the app's exit-reason vocabulary.
   *
   * ── WHY A KEY AND NOT JUST THE NOTE ─────────────────────────────────────────
   * `note` already takes the words, and the words are where the lesson is. But a year of notes
   * cannot answer "how did the trades I sold out of fear do" or "does getting out on the first
   * touch of the 10-EMA save me money" — those need one spelling per reason, which is what a key
   * is. Optional, and absent on every sell recorded before this existed, so nothing may assume it.
   *
   * Deliberately a bare `string` in core: the vocabulary is the USER's to extend (see the app's
   * `portfolio/exitReasons.ts`), so a union here would be a promise core cannot keep — and core
   * must not own a list the app lets people add rows to.
   */
  exitReasonKey?: string;
  /**
   * Fee paid on the sale, in the account's currency. A sell matched against three lots is ONE
   * order and pays one fee, so it sits on the first record of that sale only. Absent = 0.
   */
  fee?: number;
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
  /** Net dated deposits (+) / withdrawals (−) booked after opening. */
  netCashFlow: number;
  /** initialCapital + netCashFlow — the money actually put in. PnL's base. */
  contributedCapital: number;
  /** equity − contributedCapital. Neutral to deposits and withdrawals. */
  totalPnL: number;
  /** totalPnL as % of contributedCapital (money-weighted; timing of flows dilutes it). */
  totalPnLPct: number;
  /** Time-weighted return %, independent of the size and timing of cash flows. */
  twrPct: number;
  /** twrPct annualized over 365 calendar days. */
  twrAnnualizedPct: number;
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
