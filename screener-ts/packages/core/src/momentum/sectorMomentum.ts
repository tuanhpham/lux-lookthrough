import type { Bar, OHLCV } from '../types/market.js';
import type { SectorMomentum, SectorMomentumReport } from './types.js';
import { DEFAULT_MOMENTUM_CONFIG, type MomentumConfig } from './config.js';
import { computeMomentumScore, rankMomentum } from './momentumEngine.js';
import { SECTOR_STOCKS } from '../screener/sectors.js';
import { mean } from '../indicators/rolling.js';
import { pyRound } from '../util/round.js';

/**
 * F3 — Sector momentum / rotation.
 *
 * For each sector: average 1M and 3M return, average relative strength vs the
 * benchmark, and the number of its stocks sitting in the top-momentum percentile
 * (computed across the whole fetched universe). Sectors are ranked by a blended
 * momentum score; the top/bottom N become hot/cold sectors.
 *
 * Mirrors the shape of `computeSectorVolumeRank` (`screener/sectorVolume.ts`):
 * takes a pre-fetched map of OHLCV per symbol so core stays I/O-free, and reuses
 * the momentum engine rather than re-deriving returns.
 */
export function computeSectorMomentum(
  dataBySymbol: Map<string, OHLCV>,
  benchmark?: readonly Bar[],
  sectorStocks: Record<string, string[]> = SECTOR_STOCKS,
  cfg: MomentumConfig = DEFAULT_MOMENTUM_CONFIG,
): SectorMomentumReport {
  // Rank the entire universe once so each stock has a percentile rank; the
  // top-momentum count per sector reads off it.
  const ranked = rankMomentum(dataBySymbol, benchmark, cfg);
  const percentileBySymbol = new Map(ranked.map((r) => [r.symbol, r.percentileRank]));

  const rows: Omit<SectorMomentum, 'rank'>[] = [];

  for (const [sector, symbols] of Object.entries(sectorStocks)) {
    const ret1m: number[] = [];
    const ret3m: number[] = [];
    const rsVals: number[] = [];
    let topMomentumCount = 0;
    let scored = 0;

    for (const sym of symbols) {
      const ohlcv = dataBySymbol.get(sym);
      if (!ohlcv || ohlcv.bars.length < cfg.minBars) continue;
      const m = computeMomentumScore(sym, ohlcv.bars, benchmark, cfg);
      scored += 1;
      if (m.returns.oneMonth !== null) ret1m.push(m.returns.oneMonth);
      if (m.returns.threeMonth !== null) ret3m.push(m.returns.threeMonth);
      rsVals.push(m.relativeStrength);
      if ((percentileBySymbol.get(sym) ?? 0) >= cfg.sector.topMomentumPercentile) {
        topMomentumCount += 1;
      }
    }

    if (scored === 0) continue;
    rows.push({
      sector,
      avgReturn1m: pyRound(mean(ret1m.length ? ret1m : [0]), 2),
      avgReturn3m: pyRound(mean(ret3m.length ? ret3m : [0]), 2),
      avgRelativeStrength: pyRound(mean(rsVals.length ? rsVals : [0]), 2),
      topMomentumCount,
      scored,
    });
  }

  // Rank sectors by a blended momentum proxy (3M return + RS dominate, like the
  // stock-level weights), then by hot-stock count as a tiebreak.
  rows.sort((a, b) => {
    const sa = a.avgReturn3m + a.avgRelativeStrength + a.avgReturn1m * 0.5;
    const sb = b.avgReturn3m + b.avgRelativeStrength + b.avgReturn1m * 0.5;
    if (sb !== sa) return sb - sa;
    return b.topMomentumCount - a.topMomentumCount;
  });

  const rankings: SectorMomentum[] = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const hotSectors = rankings.slice(0, cfg.sector.hotSectorCount).map((r) => r.sector);
  const coldSectors = rankings
    .slice(Math.max(0, rankings.length - cfg.sector.coldSectorCount))
    .map((r) => r.sector)
    .reverse();

  return { rankings, hotSectors, coldSectors };
}
