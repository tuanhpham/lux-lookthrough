import type {
  StageResult,
  ConsolidationResult,
  PivotResult,
} from '../types/signals.js';
import { pyRound } from '../util/round.js';

/**
 * Conviction score 0–100 — faithful port of `compute_score`.
 *
 * Rubric (linear-scaled, NOT step thresholds):
 *   stage 2 → +25 ; stage 1 → +10
 *   atr_pts   = min(atr_contraction_pct / 30, 1) * 20      ← NO lower clamp:
 *               a NEGATIVE atr_contraction (ATR expanded) yields negative pts,
 *               which can push the final score below 0 (verified vs Python).
 *   range_pts = min( max(0, (30 - price_range_pct)/25) * 15, 15 )
 *   vol_pts   = min( max(volume_dry_up_pct, 0)/40, 1 ) * 15
 *   vcp_pts   = min( vcp_contractions * 5, 15 )
 *   prox_pts  = (pivot && dist>=0) ? max(0, (5 - dist)/5) * 10 : 0
 *   score = round( min(sum, 100), 1 )
 *
 * The final score is clamped to <= 100 but NOT to >= 0.
 */
export function computeScore(
  stage: StageResult,
  cons: ConsolidationResult,
  pivot: PivotResult,
): number {
  let score = 0;

  if (stage.stage === 2) score += 25;
  else if (stage.stage === 1) score += 10;

  // ATR contraction: 0–20 pts linear from 0%→30%, no lower bound.
  const atrPts = Math.min(cons.atrContractionPct / 30, 1) * 20;
  score += atrPts;

  // Price-range tightness: 0–15 pts (30% range → 0, 5% → 15).
  const rangePts = Math.max(0, (30 - cons.priceRangePct) / 25) * 15;
  score += Math.min(rangePts, 15);

  // Volume dry-up: 0–15 pts linear from 0%→40%.
  const volPts = Math.min(Math.max(cons.volumeDryUpPct, 0) / 40, 1) * 15;
  score += volPts;

  // VCP contraction count.
  const vcpPts = Math.min(cons.vcpContractions * 5, 15);
  score += vcpPts;

  // Proximity to pivot: 0–10 pts within 5%.
  if (pivot.pivotHigh !== null && pivot.distanceToPivotPct >= 0) {
    const proxPts = Math.max(0, (5 - pivot.distanceToPivotPct) / 5) * 10;
    score += proxPts;
  }

  return pyRound(Math.min(score, 100), 1);
}
