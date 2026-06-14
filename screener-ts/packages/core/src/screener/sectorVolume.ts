import type { OHLCV, SectorRank } from '../types/market.js';
import { mean } from '../indicators/rolling.js';
import { pyRound } from '../util/round.js';
import { SECTOR_STOCKS } from './sectors.js';

/**
 * Rank sectors by 3m-vs-6m average-volume change — port of
 * `compute_sector_volume_rank`. Pass a map of pre-fetched 6mo OHLCV per symbol.
 *
 * Per stock (needs >= 60 bars): avg_3m = mean(volume[-63:]),
 * avg_6m = mean(volume[-126:]). Sector averages are the mean across its stocks'
 * per-stock averages; change% = (sec3m - sec6m)/sec6m*100. Sorted desc, ranked.
 */
export function computeSectorVolumeRank(
  dataBySymbol: Map<string, OHLCV>,
  sectorStocks: Record<string, string[]> = SECTOR_STOCKS,
): SectorRank[] {
  const rows: Omit<SectorRank, 'rank'>[] = [];

  for (const [sector, symbols] of Object.entries(sectorStocks)) {
    const vols3m: number[] = [];
    const vols6m: number[] = [];

    for (const sym of symbols) {
      const ohlcv = dataBySymbol.get(sym);
      if (!ohlcv || ohlcv.bars.length < 60) continue;
      const vol = ohlcv.bars.map((b) => b.volume);
      const nDays = vol.length;
      const cutoff3m = Math.max(0, nDays - 63);
      const cutoff6m = Math.max(0, nDays - 126);
      const avg3m = mean(vol.slice(cutoff3m));
      const avg6m = mean(vol.slice(cutoff6m));
      if (avg3m > 0 && avg6m > 0) {
        vols3m.push(avg3m);
        vols6m.push(avg6m);
      }
    }

    if (vols3m.length === 0) continue;
    const secAvg3m = mean(vols3m);
    const secAvg6m = mean(vols6m);
    const changePct = ((secAvg3m - secAvg6m) / secAvg6m) * 100;

    rows.push({
      sector,
      avgVolume3m: pyRound(secAvg3m, 0),
      avgVolume6m: pyRound(secAvg6m, 0),
      volumeChangePct: pyRound(changePct, 2),
    });
  }

  rows.sort((a, b) => b.volumeChangePct - a.volumeChangePct);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface TopSectorStock {
  symbol: string;
  sector: string;
  volumeSurgePct: number;
  priceChangePct: number;
  currentPrice: number;
  avgVolume20d: number;
  avgVolume3m: number;
}

/**
 * Top N stocks in a sector by recent volume surge — port of
 * `get_top_stocks_for_sector`. surge = (avg20d / avg3m - 1) * 100; needs >= 63
 * bars; price change is now vs 20 bars ago.
 */
export function topStocksForSector(
  sector: string,
  dataBySymbol: Map<string, OHLCV>,
  topN = 5,
  sectorStocks: Record<string, string[]> = SECTOR_STOCKS,
): TopSectorStock[] {
  const symbols = sectorStocks[sector] ?? [];
  const rows: TopSectorStock[] = [];

  for (const sym of symbols) {
    const ohlcv = dataBySymbol.get(sym);
    if (!ohlcv || ohlcv.bars.length < 63) continue;
    const bars = ohlcv.bars;
    const n = bars.length;
    const vol = bars.map((b) => b.volume);
    const avg20d = mean(vol.slice(-20));
    const avg3m = mean(vol.slice(Math.max(0, n - 63)));
    if (avg3m <= 0) continue;

    const surgePct = ((avg20d - avg3m) / avg3m) * 100;
    const priceNow = bars[n - 1]!.close;
    const price20dAgo = n >= 20 ? bars[n - 20]!.close : priceNow;
    const priceChangePct = ((priceNow - price20dAgo) / price20dAgo) * 100;

    rows.push({
      symbol: sym,
      sector,
      volumeSurgePct: pyRound(surgePct, 2),
      priceChangePct: pyRound(priceChangePct, 2),
      currentPrice: pyRound(priceNow, 2),
      avgVolume20d: pyRound(avg20d, 0),
      avgVolume3m: pyRound(avg3m, 0),
    });
  }

  rows.sort((a, b) => b.volumeSurgePct - a.volumeSurgePct);
  return rows.slice(0, topN);
}
