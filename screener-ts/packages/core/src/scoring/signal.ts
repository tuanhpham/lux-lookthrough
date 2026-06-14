import type {
  ConsolidationResult,
  PivotResult,
  StageResult,
  SignalType,
} from '../types/signals.js';

/**
 * Signal generation — faithful port of the branch in `scan_stock`.
 *
 *   if not is_consolidating OR stage == 4                 → NO_SIGNAL
 *   elif score >= 70 AND pivot_high AND dist <= 3.0       → BREAKOUT_IMMINENT
 *   elif is_consolidating AND score >= 40                 → CONSOLIDATING
 *   else                                                  → NO_SIGNAL
 */
export function generateSignal(
  stage: StageResult,
  cons: ConsolidationResult,
  pivot: PivotResult,
  score: number,
): SignalType {
  if (!cons.isConsolidating || stage.stage === 4) return 'NO_SIGNAL';
  if (score >= 70 && pivot.pivotHigh !== null && pivot.distanceToPivotPct <= 3.0) {
    return 'BREAKOUT_IMMINENT';
  }
  if (cons.isConsolidating && score >= 40) return 'CONSOLIDATING';
  return 'NO_SIGNAL';
}
