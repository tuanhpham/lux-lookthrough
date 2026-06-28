import type { Bar } from '../types/market.js';
import type { BacktestConfig } from './config.js';

/** What the engine knows about one open position when asking a strategy to exit. */
export interface OpenPosition {
  symbol: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  stop: number;
  target: number | null;
  /** Bars elapsed since entry (0 on the entry bar). */
  barsHeld: number;
  /** Highest close seen since entry (for trailing logic). */
  highestClose: number;
}

/**
 * Context handed to a Strategy on each simulation day. `bars` is sliced to
 * [0 .. index] — it NEVER contains future bars (the no-lookahead guarantee).
 */
export interface StrategyContext {
  symbol: string;
  /** Bars up to and including the current day. Last element is "today". */
  bars: readonly Bar[];
  /** Index of the current day within the full series. */
  index: number;
  cfg: BacktestConfig;
  /** The open position for this symbol, if any. */
  position: OpenPosition | null;
}

/** A strategy's request to open a position on the NEXT bar's open. */
export interface EntrySignal {
  /** Price level that triggers the entry (e.g. the pivot). Filled if the next
   * bar trades through it; otherwise the signal lapses. */
  triggerPrice: number;
  /** Initial stop. */
  stop: number;
  /** Optional target. */
  target: number | null;
  reason: string;
}

/** A strategy's request to close the open position. */
export interface ExitSignal {
  /** 'stop' / 'target' fill intrabar at that price; others fill at next open. */
  kind: 'stop' | 'target' | 'ema' | 'time' | 'signal';
  price: number;
  reason: string;
}

/** A strategy = pure decision functions over the windowed context. */
export interface Strategy {
  name: string;
  /** Return an entry signal to arm for the next bar, or null. Called only when
   * flat (no open position for the symbol). */
  shouldEnter(ctx: StrategyContext): EntrySignal | null;
  /** Return an exit signal, or null to hold. Called only when in a position. */
  shouldExit(ctx: StrategyContext): ExitSignal | null;
}

/** One completed round-trip trade. */
export interface Trade {
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  /** Gross PnL (exit − entry) × shares, before costs. */
  grossPnL: number;
  /** Net PnL after slippage + commission. */
  netPnL: number;
  /** Net PnL as a multiple of initial risk per share (R-multiple). */
  rMultiple: number;
  barsHeld: number;
  exitReason: string;
}

/** A point on the equity curve. */
export interface EquityPoint {
  date: string;
  equity: number;
}

export interface BacktestResult {
  strategy: string;
  symbols: string[];
  trades: Trade[];
  equityCurve: EquityPoint[];
  startDate: string | null;
  endDate: string | null;
  finalEquity: number;
}
