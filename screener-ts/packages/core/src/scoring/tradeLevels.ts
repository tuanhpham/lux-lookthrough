import type { TradeLevels } from '../types/signals.js';
import { pyRound } from '../util/round.js';

/**
 * Entry / stop / target / R:R — faithful port of `calculate_trade_levels`.
 *
 *   if pivot_high is None or atr <= 0 → all None
 *   entry = round(pivot_high * 1.001, 2)
 *   stop  = round(entry - atr * atr_multiplier_stop, 2)   (default mult 1.5)
 *   risk  = entry - stop ; if risk <= 0 → (entry, stop, None, None)
 *   target = round(entry + risk * risk_reward_target, 2)  (default 3.0)
 *   rr     = round(risk_reward_target, 2)
 */
export function calculateTradeLevels(
  _currentPrice: number,
  pivotHigh: number | null,
  atrValue: number,
  atrMultiplierStop = 1.5,
  riskRewardTarget = 3.0,
): TradeLevels {
  if (pivotHigh === null || atrValue <= 0) {
    return { entryPrice: null, stopLoss: null, targetPrice: null, riskReward: null };
  }

  const entry = pyRound(pivotHigh * 1.001, 2);
  const stop = pyRound(entry - atrValue * atrMultiplierStop, 2);
  const risk = entry - stop;
  if (risk <= 0) {
    return { entryPrice: entry, stopLoss: stop, targetPrice: null, riskReward: null };
  }
  const target = pyRound(entry + risk * riskRewardTarget, 2);
  const rr = pyRound(riskRewardTarget, 2);
  return { entryPrice: entry, stopLoss: stop, targetPrice: target, riskReward: rr };
}
