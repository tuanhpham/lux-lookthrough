import { describe, it, expect } from 'vitest';
import { filterByMomentum } from '../../src/momentum/momentumFilter.js';
import type { OHLCV } from '../../src/types/market.js';
import { series } from '../qm/helpers.js';

/** 10 symbols with monotonically decreasing strength S0 (strongest) .. S9. */
function buildUniverse(): Map<string, OHLCV> {
  const map = new Map<string, OHLCV>();
  for (let i = 0; i < 10; i++) {
    const rate = 1.006 - i * 0.0008; // S0 strongest, S9 weakest/declining
    map.set(`S${i}`, { symbol: `S${i}`, bars: series(300, (j) => 50 * Math.pow(rate, j), () => 5_000_000) });
  }
  return map;
}

describe('filterByMomentum', () => {
  it('keeps the top fraction of the universe by momentum', () => {
    const map = buildUniverse();
    const res = filterByMomentum(map, { topPct: 0.2 });
    expect(res.scored).toBe(10);
    expect(res.symbols.length).toBe(2); // ceil(10 * 0.2)
    // The strongest names should be the survivors.
    expect(res.symbols).toContain('S0');
  });

  it('returns a strict subset of the input universe (F4/F7 safety)', () => {
    const map = buildUniverse();
    const res = filterByMomentum(map, { topPct: 0.5 });
    const input = new Set(map.keys());
    expect(res.symbols.every((s) => input.has(s))).toBe(true);
    expect(res.symbols.length).toBeLessThanOrEqual(map.size);
  });

  it('keeps at least one symbol when anything scored', () => {
    const map = buildUniverse();
    const res = filterByMomentum(map, { topPct: 0.0001 });
    expect(res.symbols.length).toBe(1);
  });

  it('intersects with hot sectors when hotSectorsOnly is set', () => {
    const map = buildUniverse();
    // Put the strongest names in HOT, weakest in COLD.
    const sectors = {
      HOT: ['S0', 'S1', 'S2'],
      COLD: ['S7', 'S8', 'S9'],
    };
    const res = filterByMomentum(map, { topPct: 0.5, hotSectorsOnly: true, sectorStocks: sectors });
    expect(res.hotSectors).toContain('HOT');
    // Everything kept must belong to a hot sector.
    const hotSet = new Set(res.hotSectors.flatMap((s) => (sectors as Record<string, string[]>)[s] ?? []));
    expect(res.symbols.every((s) => hotSet.has(s))).toBe(true);
  });

  it('handles an empty universe', () => {
    const res = filterByMomentum(new Map());
    expect(res.symbols).toEqual([]);
    expect(res.scored).toBe(0);
  });
});
