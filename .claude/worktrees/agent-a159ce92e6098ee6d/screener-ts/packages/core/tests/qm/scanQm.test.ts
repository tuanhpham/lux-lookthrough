import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { scanQm } from '../../src/qm/scanQm.js';
import { qmToRow } from '../../src/qm/qmRow.js';
import type { Bar } from '../../src/types/market.js';

const here = dirname(fileURLToPath(import.meta.url));
const cases: { name: string; bars: Bar[] }[] = JSON.parse(
  readFileSync(join(here, '..', 'fixtures', 'golden.json'), 'utf8'),
);
const byName = (n: string): Bar[] => cases.find((c) => c.name === n)!.bars;

describe('scanQm (integration on golden fixtures)', () => {
  it('returns a complete result shape for every fixture', () => {
    for (const c of cases) {
      const r = scanQm(c.name.toUpperCase(), c.bars);
      expect(r.symbol).toBe(c.name.toUpperCase());
      expect(r.qualityScore).toBeGreaterThanOrEqual(0);
      expect(r.qualityScore).toBeLessThanOrEqual(100);
      expect(['VCP', 'EPISODIC_PIVOT', 'BOTH', 'NONE']).toContain(r.setupType);
    }
  });

  it('ranks the tightening uptrend above the downtrend', () => {
    const up = scanQm('UPTREND_TIGHTENING', byName('uptrend_tightening'));
    const down = scanQm('DOWNTREND', byName('downtrend'));
    expect(up.qualityScore).toBeGreaterThan(down.qualityScore);
  });

  it('fails the trend gate on the downtrend (no VCP setup)', () => {
    const down = scanQm('DOWNTREND', byName('downtrend'));
    expect(down.trend.passed).toBe(false);
    expect(down.setupType).not.toBe('VCP');
    expect(down.setupType).not.toBe('BOTH');
  });

  it('riskPct is consistent with entry/stop when trade levels exist', () => {
    for (const c of cases) {
      const r = scanQm(c.name.toUpperCase(), c.bars);
      if (r.levels.entryPrice != null && r.levels.stopLoss != null && r.riskPct != null) {
        const expected = ((r.levels.entryPrice - r.levels.stopLoss) / r.levels.entryPrice) * 100;
        expect(r.riskPct).toBeCloseTo(expected, 1);
      }
    }
  });

  it('qmToRow flattens without losing the headline fields', () => {
    const r = scanQm('UPTREND_TIGHTENING', byName('uptrend_tightening'));
    const row = qmToRow(r, 'Technology');
    expect(row.symbol).toBe('UPTREND_TIGHTENING');
    expect(row.sector).toBe('Technology');
    expect(row.qualityScore).toBe(r.qualityScore);
    expect(row.setupType).toBe(r.setupType);
    expect(row.pivot).toBe(r.vcp.pivot);
  });
});
