import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanStock } from '../src/scoring/scanStock.js';
import { buildSummary } from '../src/analysis/summary.js';
import type { Bar } from '../src/types/market.js';

const here = dirname(fileURLToPath(import.meta.url));
const cases: { name: string; bars: Bar[] }[] = JSON.parse(
  readFileSync(join(here, 'fixtures', 'golden.json'), 'utf8'),
);

describe('buildSummary (bilingual analysis)', () => {
  it('produces non-empty EN + VI prose for every fixture', () => {
    for (const c of cases) {
      const r = scanStock(c.name.toUpperCase(), c.bars);
      const s = buildSummary(r);
      expect(s.en.length).toBeGreaterThan(40);
      expect(s.vi.length).toBeGreaterThan(40);
      expect(s.en).toContain(c.name.toUpperCase());
      expect(s.en).toContain('not financial advice');
      expect(s.vi).toContain('không phải lời khuyên đầu tư');
    }
  });

  it('reflects the signal phrase in the headline', () => {
    const breakout = cases.find((c) => c.name === 'uptrend_tightening')!;
    const r = scanStock('UPTREND_TIGHTENING', breakout.bars);
    const s = buildSummary(r);
    if (r.signal === 'BREAKOUT_IMMINENT') {
      expect(s.en).toContain('breakout looks imminent');
      expect(s.vi).toContain('sắp xảy ra');
    }
  });
});
