import type { QmScanResult } from '../qm/types.js';
import { pyRound } from '../util/round.js';

/** Account context a trade plan sizes against. */
export interface TradePlanAccount {
  /** Total account equity in the account currency. */
  equity: number;
  /** Fraction of equity to risk per trade, as a percent (e.g. 1.0 = 1%). */
  riskPctPerTrade: number;
}

export interface TradePlanConfig {
  /** Cap any single position at this % of equity (concentration guard). */
  maxPositionPct: number;
}

export const DEFAULT_TRADE_PLAN_CONFIG: TradePlanConfig = {
  maxPositionPct: 25,
};

/** A concrete, position-sized trade plan derived from a QM scan (Phase 8). */
export interface TradePlan {
  symbol: string;
  /** True when the scan produced usable entry/stop levels. */
  actionable: boolean;
  entry: number | null;
  stop: number | null;
  target: number | null;
  riskReward: number | null;
  /** Stop-based risk per share as a % of entry. */
  riskPct: number | null;
  /** Shares to buy so the stop-out loss ≈ equity × riskPctPerTrade. */
  shares: number;
  /** shares × entry. */
  positionValue: number;
  /** positionValue as a % of equity. */
  positionPct: number;
  /** Cash actually risked to the stop (shares × (entry − stop)). */
  riskAmount: number;
  /** Expected reward in R if the target is hit (= riskReward). */
  expectedR: number | null;
  qualityScore: number;
  /** Best available confidence: VCP confidence, else EP confidence. */
  confidence: number;
  /** Whether the position size was capped by maxPositionPct. */
  cappedByConcentration: boolean;
}

/**
 * Phase 8 — build a position-sized trade plan from a QM scan result.
 *
 * Reuses the entry/stop/target already computed by `scanQm` (via
 * `calculateTradeLevels`) — it does NOT recompute levels. Position size is the
 * classic risk-based formula: risk the configured % of equity to the stop, then
 * cap the notional at `maxPositionPct` of equity.
 *
 *   sharesByRisk = floor((equity × riskPctPerTrade/100) / (entry − stop))
 *   sharesByCap  = floor((equity × maxPositionPct/100) / entry)
 *   shares       = min(sharesByRisk, sharesByCap)
 */
export function buildTradePlan(
  scan: QmScanResult,
  account: TradePlanAccount,
  cfg: TradePlanConfig = DEFAULT_TRADE_PLAN_CONFIG,
): TradePlan {
  const { entryPrice: entry, stopLoss: stop, targetPrice: target, riskReward } = scan.levels;

  const base: TradePlan = {
    symbol: scan.symbol,
    actionable: false,
    entry,
    stop,
    target,
    riskReward,
    riskPct: scan.riskPct,
    shares: 0,
    positionValue: 0,
    positionPct: 0,
    riskAmount: 0,
    expectedR: riskReward,
    qualityScore: scan.qualityScore,
    confidence: Math.max(scan.vcp.confidence, scan.ep.confidence),
    cappedByConcentration: false,
  };

  // No usable levels (no pivot / no ATR), or a degenerate account → not actionable.
  const riskPerShare = entry != null && stop != null ? entry - stop : 0;
  if (entry == null || stop == null || riskPerShare <= 0 || account.equity <= 0) {
    return base;
  }

  const sharesByRisk = Math.floor((account.equity * account.riskPctPerTrade) / 100 / riskPerShare);
  const sharesByCap = Math.floor((account.equity * cfg.maxPositionPct) / 100 / entry);
  const shares = Math.max(0, Math.min(sharesByRisk, sharesByCap));

  const positionValue = pyRound(shares * entry, 2);
  return {
    ...base,
    actionable: shares > 0,
    shares,
    positionValue,
    positionPct: pyRound((positionValue / account.equity) * 100, 2),
    riskAmount: pyRound(shares * riskPerShare, 2),
    cappedByConcentration: shares > 0 && sharesByCap < sharesByRisk,
  };
}
