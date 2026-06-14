/**
 * Parity tests: assert the TS pattern engine reproduces the Python reference
 * EXACTLY on fixtures whose expected values were generated from the live Python
 * implementation (see tests/fixtures/golden.json, produced by gen_golden.py).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { analyzeStage } from '../src/patterns/stage.js';
import { detectConsolidation } from '../src/patterns/consolidation.js';
import { detectPivot } from '../src/patterns/pivot.js';
import { atr } from '../src/indicators/atr.js';
import { computeScore } from '../src/scoring/score.js';
import { calculateTradeLevels } from '../src/scoring/tradeLevels.js';
import { scanStock } from '../src/scoring/scanStock.js';
import type { Bar } from '../src/types/market.js';

const here = dirname(fileURLToPath(import.meta.url));
interface GoldenCase {
  name: string;
  bars: Bar[];
  expected: Record<string, unknown>;
}
const cases: GoldenCase[] = JSON.parse(
  readFileSync(join(here, 'fixtures', 'golden.json'), 'utf8'),
);

// Compare numbers at 6 dp (golden values are rounded to 6); pass null through.
function near(actual: number | null, expected: unknown): void {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).not.toBeNull();
  expect(actual!).toBeCloseTo(expected as number, 6);
}

describe('pattern-engine parity with Python reference', () => {
  for (const c of cases) {
    describe(c.name, () => {
      const e = c.expected;

      it('stage analysis matches', () => {
        const s = analyzeStage(c.bars);
        expect(s.stage).toBe(e.stage);
        expect(s.label).toBe(e.stage_label);
        near(s.ma50, e.ma_50);
        near(s.ma150, e.ma_150);
        near(s.ma200, e.ma_200);
        near(s.price, e.price);
      });

      it('consolidation metrics match', () => {
        const cons = detectConsolidation(c.bars);
        expect(cons.isConsolidating).toBe(e.is_consolidating);
        expect(cons.daysInBase).toBe(e.days_in_base);
        near(cons.priceRangePct, e.price_range_pct);
        near(cons.atrContractionPct, e.atr_contraction_pct);
        near(cons.volumeDryUpPct, e.volume_dry_up_pct);
        expect(cons.vcpContractions).toBe(e.vcp_contractions);
        near(cons.tightestRangePct, e.tightest_range_pct);
      });

      it('pivot detection matches', () => {
        const p = detectPivot(c.bars);
        near(p.pivotHigh, e.pivot_high);
        near(p.distanceToPivotPct, e.distance_to_pivot_pct);
        expect(p.recentPivots.length).toBe((e.recent_pivots as number[]).length);
        p.recentPivots.forEach((v, i) =>
          near(v, (e.recent_pivots as number[])[i]),
        );
      });

      it('current ATR matches', () => {
        const series = atr(c.bars, 14).filter((v) => !Number.isNaN(v));
        const current = series.length ? series[series.length - 1]! : 0;
        near(current, e.current_atr);
      });

      it('score and signal match', () => {
        const result = scanStock(c.name.toUpperCase(), c.bars);
        near(result.score, e.score);
        expect(result.signal).toBe(e.signal);
      });

      it('trade levels match', () => {
        const series = atr(c.bars, 14).filter((v) => !Number.isNaN(v));
        const current = series.length ? series[series.length - 1]! : 0;
        const pivot = detectPivot(c.bars);
        const price = c.bars[c.bars.length - 1]!.close;
        const lv = calculateTradeLevels(price, pivot.pivotHigh, current);
        near(lv.entryPrice, e.entry_price);
        near(lv.stopLoss, e.stop_loss);
        near(lv.targetPrice, e.target_price);
        near(lv.riskReward, e.risk_reward);
      });
    });
  }
});
