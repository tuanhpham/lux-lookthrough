// Barrel for the backtesting engine (Phase 10).
export { DEFAULT_BACKTEST_CONFIG } from './config.js';
export type { BacktestConfig } from './config.js';
export { runBacktest } from './engine.js';
export { computeStats } from './statistics.js';
export type { BacktestStats } from './statistics.js';
export { vcpStrategy } from './strategies/vcpStrategy.js';
export { momentumStrategy } from './strategies/momentumStrategy.js';
export type { MomentumStrategyOptions } from './strategies/momentumStrategy.js';
export type {
  Strategy,
  StrategyContext,
  EntrySignal,
  ExitSignal,
  OpenPosition,
  Trade,
  EquityPoint,
  BacktestResult,
} from './types.js';
