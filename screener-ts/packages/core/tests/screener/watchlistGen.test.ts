import { describe, it, expect } from 'vitest';
import { generateWatchlists } from '../../src/screener/watchlistGen.js';
import { computeMomentumScore } from '../../src/momentum/momentumEngine.js';
import type { QmScanResult } from '../../src/qm/types.js';
import type { MomentumResult, SectorMomentumReport } from '../../src/momentum/types.js';
import { series } from '../qm/helpers.js';

/** Build a QmScanResult stub with only the fields generateWatchlists reads. */
function scan(symbol: string, o: {
  setupType?: QmScanResult['setupType'];
  isVcp?: boolean; baseDepthPct?: number; pivot?: number | null; price?: number;
  quality?: number; isEp?: boolean; epConfidence?: number;
}): QmScanResult {
  return {
    symbol, price: o.price ?? 100, setupType: o.setupType ?? 'VCP',
    qualityScore: o.quality ?? 50, relativeStrength: 0,
    trend: {} as QmScanResult['trend'],
    vcp: { isVcp: o.isVcp ?? false, pivot: o.pivot ?? null, baseDepthPct: o.baseDepthPct ?? 0, confidence: 0 } as QmScanResult['vcp'],
    ep: { isEp: o.isEp ?? false, confidence: o.epConfidence ?? 0 } as QmScanResult['ep'],
    levels: { entryPrice: null, stopLoss: null, targetPrice: null, riskReward: null },
    riskPct: null,
  };
}

const sectors: SectorMomentumReport = { rankings: [], hotSectors: ['Technology', 'Energy'], coldSectors: ['Utilities'] };

describe('generateWatchlists', () => {
  it('categorizes scans into VCP / EP / breakout / tight-base lists', () => {
    const scans: QmScanResult[] = [
      scan('VCPHI', { isVcp: true, setupType: 'VCP', quality: 90, baseDepthPct: 10 }),       // VCP + tight
      scan('VCPLO', { isVcp: true, setupType: 'VCP', quality: 60, baseDepthPct: 28 }),       // VCP, wide base
      scan('BRK', { isVcp: true, setupType: 'VCP', quality: 80, pivot: 101, price: 100 }),   // 1% below pivot → breakout
      scan('GAP', { isEp: true, setupType: 'EPISODIC_PIVOT', epConfidence: 75 }),            // EP
      scan('NONE', { setupType: 'NONE' }),
    ];
    const mom: MomentumResult[] = [
      computeMomentumScore('STRONG', series(300, (i) => 50 * Math.pow(1.004, i))),
      computeMomentumScore('WEAK', series(300, (i) => 100 - 0.05 * i)),
    ];

    const wl = generateWatchlists(scans, mom, sectors);
    expect(wl.topVcp).toContain('VCPHI');
    expect(wl.topVcp).not.toContain('NONE');
    expect(wl.topEp).toEqual(['GAP']);
    expect(wl.topBreakouts).toContain('BRK');
    expect(wl.topTightBases).toContain('VCPHI');
    expect(wl.topTightBases).not.toContain('VCPLO'); // 28% base is not tight
    expect(wl.topMomentum[0]).toBe('STRONG');
    expect(wl.hotSectors).toEqual(['Technology', 'Energy']);
  });

  it('honours perCategory limit', () => {
    const scans = Array.from({ length: 30 }, (_, i) =>
      scan(`S${i}`, { isVcp: true, quality: i }),
    );
    const wl = generateWatchlists(scans, [], sectors, {
      perCategory: 5, tightBaseMaxDepthPct: 15, breakoutMaxDistancePct: 3,
    });
    expect(wl.topVcp.length).toBe(5);
  });
});
