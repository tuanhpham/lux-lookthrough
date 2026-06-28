import type { Trade, EquityPoint } from './types.js';
import { DEFAULT_BACKTEST_CONFIG, type BacktestConfig } from './config.js';
import { pyRound } from '../util/round.js';

export interface BacktestStats {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgWin: number;
  avgLoss: number;
  /** gross wins / gross losses. Infinity when there are no losses. */
  profitFactor: number;
  /** Mean net PnL per trade. */
  expectancy: number;
  /** Mean R-multiple per trade. */
  expectancyR: number;
  avgHoldBars: number;
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  /** CAGR / max drawdown (MAR ratio). */
  mar: number;
  /** R-multiple distribution bucketed for a histogram. */
  rDistribution: { bucket: string; count: number }[];
}

/** Max peak-to-trough drawdown of an equity curve, as a positive %. */
function maxDrawdown(curve: readonly EquityPoint[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) maxDd = Math.max(maxDd, (peak - p.equity) / peak);
  }
  return maxDd * 100;
}

/** Daily-return Sharpe, annualized. */
function sharpe(curve: readonly EquityPoint[], cfg: BacktestConfig): number {
  if (curve.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1]!.equity;
    if (prev > 0) rets.push(curve[i]!.equity / prev - 1);
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  const rfDaily = cfg.riskFreeRate / cfg.tradingDaysPerYear;
  return ((mean - rfDaily) / sd) * Math.sqrt(cfg.tradingDaysPerYear);
}

/** Bucket R-multiples into a coarse histogram. */
function rHistogram(trades: readonly Trade[]): { bucket: string; count: number }[] {
  const buckets: [string, (r: number) => boolean][] = [
    ['≤ -2R', (r) => r <= -2],
    ['-2..-1R', (r) => r > -2 && r <= -1],
    ['-1..0R', (r) => r > -1 && r < 0],
    ['0..1R', (r) => r >= 0 && r < 1],
    ['1..2R', (r) => r >= 1 && r < 2],
    ['2..3R', (r) => r >= 2 && r < 3],
    ['≥ 3R', (r) => r >= 3],
  ];
  return buckets.map(([bucket, test]) => ({ bucket, count: trades.filter((t) => test(t.rMultiple)).length }));
}

/** Years spanned by the equity curve (calendar), for CAGR. */
function yearsSpan(curve: readonly EquityPoint[], cfg: BacktestConfig): number {
  if (curve.length < 2) return 0;
  // Use bar count / tradingDaysPerYear to avoid a Date dependency in core.
  return (curve.length - 1) / cfg.tradingDaysPerYear;
}

/**
 * Phase 10 — compute the full statistics set from a backtest's trades + equity
 * curve. Win rate, avg win/loss, profit factor, expectancy (currency and R),
 * CAGR, max drawdown, Sharpe, MAR, avg hold, and the R-distribution.
 */
export function computeStats(
  trades: readonly Trade[],
  equityCurve: readonly EquityPoint[],
  cfg: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): BacktestStats {
  const wins = trades.filter((t) => t.netPnL > 0);
  const losses = trades.filter((t) => t.netPnL < 0);
  const grossWin = wins.reduce((s, t) => s + t.netPnL, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnL, 0));

  const first = equityCurve[0]?.equity ?? cfg.initialCapital;
  const last = equityCurve[equityCurve.length - 1]?.equity ?? cfg.initialCapital;
  const totalReturnPct = first > 0 ? (last / first - 1) * 100 : 0;
  const years = yearsSpan(equityCurve, cfg);
  const cagrPct = years > 0 && first > 0 ? ((last / first) ** (1 / years) - 1) * 100 : 0;
  const maxDd = maxDrawdown(equityCurve);

  const n = trades.length;
  const sumR = trades.reduce((s, t) => s + t.rMultiple, 0);

  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    winRatePct: n ? pyRound((wins.length / n) * 100, 1) : 0,
    avgWin: wins.length ? pyRound(grossWin / wins.length, 2) : 0,
    avgLoss: losses.length ? pyRound(-grossLoss / losses.length, 2) : 0,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : pyRound(grossWin / grossLoss, 2),
    expectancy: n ? pyRound(trades.reduce((s, t) => s + t.netPnL, 0) / n, 2) : 0,
    expectancyR: n ? pyRound(sumR / n, 2) : 0,
    avgHoldBars: n ? pyRound(trades.reduce((s, t) => s + t.barsHeld, 0) / n, 1) : 0,
    totalReturnPct: pyRound(totalReturnPct, 2),
    cagrPct: pyRound(cagrPct, 2),
    maxDrawdownPct: pyRound(maxDd, 2),
    sharpe: pyRound(sharpe(equityCurve, cfg), 2),
    mar: maxDd > 0 ? pyRound(cagrPct / maxDd, 2) : 0,
    rDistribution: rHistogram(trades),
  };
}
