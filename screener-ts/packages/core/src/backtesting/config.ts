/**
 * Backtest configuration (Phase 10). Mirrors the `DEFAULT_*_CONFIG` pattern used
 * across the codebase (qm/config.ts, momentum/config.ts) — a typed interface
 * plus a default constant, so there are no magic numbers in the engine.
 */
export interface BacktestConfig {
  /** Starting account equity. */
  initialCapital: number;
  /** Fraction of equity to risk per trade, as a percent (e.g. 1.0 = 1%). */
  riskPctPerTrade: number;
  /** Maximum concurrent open positions. */
  maxOpenPositions: number;
  /** Cap any single position at this % of equity. */
  maxConcentrationPct: number;

  /** ATR multiple for the initial stop (passed to calculateTradeLevels). */
  atrMultiplierStop: number;
  /** Risk:reward target multiple (target = entry + risk × this). */
  riskRewardTarget: number;

  /** Exit when price closes below this EMA (0 disables the EMA exit). */
  exitEmaPeriod: number;
  /** Exit after this many bars held regardless (0 disables the time stop). */
  timeStopBars: number;

  /** Per-fill slippage, as a fraction (0.001 = 0.1%). Applied against you. */
  slippagePct: number;
  /** Per-trade commission, as a fraction of notional (0.0005 = 0.05%). */
  commissionPct: number;

  /** Trading days per year, used to annualize CAGR / Sharpe. */
  tradingDaysPerYear: number;
  /** Annual risk-free rate (fraction) for the Sharpe ratio. */
  riskFreeRate: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCapital: 100_000,
  riskPctPerTrade: 1.0,
  maxOpenPositions: 10,
  maxConcentrationPct: 25,
  atrMultiplierStop: 1.5,
  riskRewardTarget: 3.0,
  exitEmaPeriod: 20,
  timeStopBars: 60,
  slippagePct: 0.001,
  commissionPct: 0.0005,
  tradingDaysPerYear: 252,
  riskFreeRate: 0.0,
};
