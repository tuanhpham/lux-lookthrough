/**
 * The scanner's measurements, handed to the conviction grader.
 *
 * ── WHY THE BRIDGE LIVES HERE AND NOT IN `planning` ─────────────────────────
 * `tradeGrader` takes a flat bag of primitives and imports nothing from `qm` on purpose:
 * it has to grade a ticker the scanner never ran on, and a grader coupled to one scanner's
 * result shape cannot be tested without constructing one. So the coupling goes the other
 * way — `qm` knows about the grader's input type, the grader knows nothing about `qm` —
 * and this file is the single place that translation happens.
 */

import type { GradeEvidence } from '../planning/tradeGrader.js';
import type { PlaybookRegime } from '../planning/playbookRegime.js';
import type { SetupKey } from '../planning/setupPlaybook.js';
import type { QmScanResult } from './types.js';

export interface GradeEvidenceInput {
  /** The playbook row the user actually chose, which decides which criteria apply. */
  setup: SetupKey | '';
  /** The market read, from the playbook's own regime detector. */
  regime?: PlaybookRegime | null;
  /** Reward-to-risk of the levels currently in the form — not the scan's own. */
  rMultiple?: number | null;
  /** Stop distance as a percent of the entry currently in the form. */
  stopPct?: number | null;
}

/**
 * Which family of pattern criteria a setup is judged on.
 *
 * 'Breakout' and 'Pullback' are base-shaped: they are consolidations that resolve, and the
 * contraction and volume-dry-up measurements mean the same thing on them. 'Surge' is a gap
 * by another name. 'Mean Reversion' and 'Other' get NEITHER, which is the honest answer —
 * this checklist is built out of trend-following literature, and a mean-reversion entry is
 * a different trade that those authors would not grade at all. It still scores on trend,
 * strength, market, liquidity and its own risk mechanics.
 */
export function patternFamily(setup: SetupKey | ''): 'base' | 'pivot' | 'none' {
  switch (setup) {
    case 'VCP':
    case 'Breakout':
    case 'Pullback':
      return 'base';
    case 'EP':
    case 'Surge':
      return 'pivot';
    default:
      return 'none';
  }
}

/**
 * Translate a scan into grader evidence.
 *
 * Fields the scan did not really measure are left OUT rather than passed as zero: the
 * grader reads a missing field as "unknown" and an explicit 0 as a failing measurement,
 * and `detectVcp` returns 0s for a stock it found no base on. Handing those over would
 * mark an episodic pivot down for having no contractions — a criticism of the setup for
 * not being a different setup.
 */
export function qmGradeEvidence(scan: QmScanResult, input: GradeEvidenceInput): GradeEvidence {
  const { trend, vcp, ep } = scan;
  const family = patternFamily(input.setup);

  const ev: GradeEvidence = {
    // ── Always applicable: the trend template is about the stock, not the pattern ──
    aboveMa50: trend.aboveEma50,
    ma50AboveMa150: trend.ema50AboveEma150,
    ma150AboveMa200: trend.ema150AboveEma200,
    ma200Rising: trend.ema200Rising,
    pctBelow52wHigh: trend.pctBelow52wHigh,
    relativeStrength: scan.relativeStrength,
    dollarVolume: trend.dollarVolume,
    regime: input.regime ?? null,
    // The plan's own numbers, not the scan's: the user may have moved the stop, and the
    // grade has to describe the trade they are about to place.
    rMultiple: input.rMultiple ?? null,
    stopPct: input.stopPct ?? null,
  };

  if (family === 'base') {
    ev.contractions = vcp.contractions;
    ev.baseDepthPct = vcp.baseDepthPct;
    ev.atrContractionPct = vcp.atrContractionPct;
    ev.volumeContractionPct = vcp.volumeContractionPct;
    // The prior advance is the base's reason for existing, so it travels with it.
    ev.previousAdvancePct = vcp.previousAdvancePct;
  }

  if (family === 'pivot') {
    ev.gapPct = ep.gapPct;
    ev.relativeVolume = ep.relativeVolume;
    ev.closeLocation = ep.closeLocation;
    ev.gapAboveResistance = ep.gapAboveResistance;
    ev.hasCatalyst = ep.catalyst !== null && ep.catalyst !== '';
  }

  return ev;
}
