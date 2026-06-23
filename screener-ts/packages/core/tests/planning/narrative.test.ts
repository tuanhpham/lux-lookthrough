import { describe, it, expect } from 'vitest';
import { explainPlan } from '../../src/planning/narrative.js';
import { scanQm } from '../../src/qm/scanQm.js';
import { uptrendSeries, series } from '../qm/helpers.js';

describe('explainPlan', () => {
  it('produces a bilingual headline and at least one bull point for a clean uptrend', () => {
    const scan = scanQm('UP', uptrendSeries(260));
    const ex = explainPlan(scan);
    expect(ex.headline.en).toContain('UP');
    expect(ex.headline.vi.length).toBeGreaterThan(0);
    expect(ex.passed.length).toBeGreaterThan(0);
    // Every point carries both languages.
    for (const p of [...ex.passed, ...ex.failed]) {
      expect(p.en.length).toBeGreaterThan(0);
      expect(p.vi.length).toBeGreaterThan(0);
    }
  });

  it('lists trend failure for a downtrend', () => {
    const scan = scanQm('DOWN', series(260, (i) => 300 - 0.5 * i));
    const ex = explainPlan(scan);
    expect(ex.failed.some((f) => /trend/i.test(f.en))).toBe(true);
  });
});
