import type {
  DataProvider,
  OHLCV,
  Fundamentals,
  Financials,
  SectorVolumeSeries,
  Period,
} from '@screener/core';

/** A symbol belongs to the Vietnam market if it carries a VN exchange suffix. */
export function isVnTicker(symbol: string): boolean {
  return /\.(VN|HN|HNX|UP|UPCOM|HM)$/i.test(symbol);
}

/**
 * Dispatches each call to the right underlying provider by symbol: Vietnam
 * tickers (suffixed `.VN` etc.) go to the VN provider, everything else to the
 * default (US) provider. This keeps a single `ctx.data` for the whole app while
 * supporting two markets with completely different data sources — business
 * logic (screener, portfolio) stays unaware there are two providers.
 */
export class MarketRouterProvider implements DataProvider {
  constructor(
    private us: DataProvider,
    private vn: DataProvider,
  ) {}

  private pick(symbol: string): DataProvider {
    return isVnTicker(symbol) ? this.vn : this.us;
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
