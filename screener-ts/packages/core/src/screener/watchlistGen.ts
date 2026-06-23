import type { QmScanResult } from '../qm/types.js';
import type { MomentumResult, SectorMomentumReport } from '../momentum/types.js';

export interface WatchlistGenConfig {
  /** Max symbols per category. */
  perCategory: number;
  /** A base counts as "tight" when its depth is ≤ this %. */
  tightBaseMaxDepthPct: number;
  /** A stock is a "breakout" candidate when within this % below its pivot. */
  breakoutMaxDistancePct: number;
}

export const DEFAULT_WATCHLIST_GEN_CONFIG: WatchlistGenConfig = {
  perCategory: 20,
  tightBaseMaxDepthPct: 15,
  breakoutMaxDistancePct: 3,
};

/** Categorized daily watchlists (Phase 7). Each list is ranked symbols. */
export interface GeneratedWatchlists {
  topMomentum: string[];
  topVcp: string[];
  topEp: string[];
  topBreakouts: string[];
  topTightBases: string[];
  topRelativeStrength: string[];
  hotSectors: string[];
}

const take = (rows: { symbol: string }[], n: number): string[] => rows.slice(0, n).map((r) => r.symbol);

/**
 * Phase 7 — build categorized watchlists from ALREADY-computed scan + momentum
 * results. Pure ranking/filtering; it computes no indicators itself, so it's
 * cheap to call after a scan and never duplicates detector logic.
 */
export function generateWatchlists(
  scans: readonly QmScanResult[],
  momentum: readonly MomentumResult[],
  sectors: SectorMomentumReport,
  cfg: WatchlistGenConfig = DEFAULT_WATCHLIST_GEN_CONFIG,
): GeneratedWatchlists {
  const n = cfg.perCategory;

  const topMomentum = take([...momentum].sort((a, b) => b.momentumScore - a.momentumScore), n);

  const topRelativeStrength = take(
    [...momentum].sort((a, b) => b.relativeStrength - a.relativeStrength),
    n,
  );

  // VCP setups, best quality first.
  const vcp = scans
    .filter((s) => s.vcp.isVcp && (s.setupType === 'VCP' || s.setupType === 'BOTH'))
    .sort((a, b) => b.qualityScore - a.qualityScore);
  const topVcp = take(vcp, n);

  // Episodic pivots, best confidence first.
  const ep = scans
    .filter((s) => s.ep.isEp)
    .sort((a, b) => b.ep.confidence - a.ep.confidence);
  const topEp = take(ep, n);

  // Breakout candidates: a valid pivot the price is sitting just under.
  const breakouts = scans
    .filter((s) => {
      const pivot = s.vcp.pivot;
      if (pivot == null || s.price <= 0) return false;
      const dist = ((pivot - s.price) / s.price) * 100;
      return dist >= 0 && dist <= cfg.breakoutMaxDistancePct;
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);
  const topBreakouts = take(breakouts, n);

  // Tight bases: shallow VCP base depth.
  const tight = scans
    .filter((s) => s.vcp.isVcp && s.vcp.baseDepthPct > 0 && s.vcp.baseDepthPct <= cfg.tightBaseMaxDepthPct)
    .sort((a, b) => a.vcp.baseDepthPct - b.vcp.baseDepthPct);
  const topTightBases = take(tight, n);

  return {
    topMomentum,
    topVcp,
    topEp,
    topBreakouts,
    topTightBases,
    topRelativeStrength,
    hotSectors: sectors.hotSectors,
  };
}
