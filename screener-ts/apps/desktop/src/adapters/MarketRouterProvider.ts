import type {
  DataProvider,
  OHLCV,
  Fundamentals,
  Financials,
  SectorVolumeSeries,
  Period,
} from '@screener/core';
import { isHnxOrUpcomTicker } from './universe.js';

/** A symbol belongs to the Vietnam market if it carries a VN exchange suffix. */
export function isVnTicker(symbol: string): boolean {
  return /\.(VN|HN|HNX|UP|UPCOM|HM)$/i.test(symbol);
}

/**
 * Routes each call to the right provider by symbol. The subtlety: Yahoo carries
 * **HOSE** stocks fully — OHLCV AND fundamentals (market cap, EPS, revenue,
 * sector) — but NOT HNX/UPCoM. So:
 *
 *   - HOSE `.VN` tickers  → the default (Yahoo) provider, keeping rich
 *     fundamentals + the revenue/EPS trend charts working.
 *   - HNX / UPCoM tickers → the VN (VNDirect) provider, which is the only free
 *     source for those boards (OHLCV only; fundamentals come back minimal).
 *   - everything else (US) → the default provider.
 *
 * This keeps a single `ctx.data` for the whole app; business logic stays unaware
 * there are two providers.
 */
export class MarketRouterProvider implements DataProvider {
  constructor(
    private us: DataProvider,
    private vn: DataProvider,
  ) {}

  /** Only HNX/UPCoM go to VNDirect; HOSE stays on Yahoo for fundamentals.
   * A symbol with no VN exchange suffix is always a US ticker — never route
   * bare names to VNDirect, since some HNX/UPCoM tickers (e.g. "DLR") collide
   * with US symbols and would return Vietnamese data for a US stock. */
  private pick(symbol: string): DataProvider {
    return isVnTicker(symbol) && isHnxOrUpcomTicker(symbol) ? this.vn : this.us;
  }

  getOHLCV(symbol: string, period: Period): Promise<OHLCV> {
    return this.pick(symbol).getOHLCV(symbol, period);
  }
  getFundamentals(symbol: string): Promise<Fundamentals> {
    return this.pick(symbol).getFundamentals(symbol);
  }
  getFinancials(symbol: string): Promise<Financials> {
    return this.pick(symbol).getFinancials(symbol);
  }
  getSectorVolume(
    sector: string,
    period: Period,
    freq: 'weekly' | 'monthly',
  ): Promise<SectorVolumeSeries> {
    // Sector-volume is a US-only provider feature; VN sectors are computed
    // client-side from fetched bars. Route to the US provider for parity.
    return this.us.getSectorVolume(sector, period, freq);
  }
}
