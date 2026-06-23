import { describe, it, expect } from 'vitest';
import { computeSectorMomentum } from '../../src/momentum/sectorMomentum.js';
import type { OHLCV } from '../../src/types/market.js';
import { series } from '../qm/helpers.js';

/** Two sectors: HOT (strong compounding names) and COLD (declining names). */
function buildUniverse(): { map: Map<string, OHLCV>; sectors: Record<string, string[]> } {
  const map = new Map<string, OHLCV>();
  const hot = ['H1', 'H2', 'H3'];
  const cold = ['C1', 'C2', 'C3'];
  hot.forEach((s, i) =>
    map.set(s, { symbol: s, bars: series(300, (j) => 50 * Math.pow(1.004 + i * 0.0005, j), () => 5_000_000) }),
  );
  cold.forEach((s) =>
    map.set(s, { symbol: s, bars: series(300, (j) => 150 - 0.2 * j, () => 5_000_000) }),
  );
  return { map, sectors: { HOT: hot, COLD: cold } };
}

describe('computeSectorMomentum', () => {
  it('ranks the strong sector above the weak one', () => {
    const { map, sectors } = buildUniverse();
    const report = computeSectorMomentum(map, undefined, sectors);
    expect(report.rankings[0]!.sector).toBe('HOT');
    expect(report.rankings[0]!.rank).toBe(1);
    expect(report.rankings[0]!.avgReturn3m).toBeGreaterThan(report.rankings[1]!.avgReturn3m);
  });

  it('reports hot and cold sectors', () => {
    const { map, sectors } = buildUniverse();
    const report = computeSectorMomentum(map, undefined, sectors);
    expect(report.hotSectors).toContain('HOT');
    expect(report.coldSectors).toContain('COLD');
  });

  it('counts how many of a sector were scored', () => {
    const { map, sectors } = buildUniverse();
    const report = computeSectorMomentum(map, undefined, sectors);
    const hot = report.rankings.find((r) => r.sector === 'HOT')!;
    expect(hot.scored).toBe(3);
  });
});
