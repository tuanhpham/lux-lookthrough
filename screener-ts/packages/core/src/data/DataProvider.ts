import type {
  OHLCV,
  Fundamentals,
  Financials,
  SectorVolumeSeries,
  Period,
} from '../types/market.js';

/**
 * The ONLY way business logic touches external data. Concrete adapters
 * (Yahoo, Finnhub) live in the app — NEVER in core — so core stays importable
 * unchanged by desktop and a future React Native app.
 */
/**
 * `fresh` skips the provider's short in-memory cache and goes to the network.
 *
 * For a request the USER made — the Portfolio's Update button. That cache exists so
 * a scan and a chart opened a minute apart share one download; it must not answer
 * "Update" with the same bars the previous click got, which is what it did for up
 * to 15 minutes. The fresh result still refills the cache for everyone else.
 */
export interface OhlcvOptions {
  fresh?: boolean;
}

export interface DataProvider {
  getOHLCV(symbol: string, period: Period, opts?: OhlcvOptions): Promise<OHLCV>;
  getFundamentals(symbol: string): Promise<Fundamentals>;
  getFinancials(symbol: string): Promise<Financials>;
  getSectorVolume(
    sector: string,
    period: Period,
    freq: 'weekly' | 'monthly',
  ): Promise<SectorVolumeSeries>;
  /** Lightweight sector+industry lookup for a symbol. Returns nulls if the
   * provider cannot determine them (e.g. VN tickers, unknown symbols). */
  getSectorLabel(symbol: string): Promise<{ sector: string | null; industry: string | null }>;
}

/** Fetch many symbols' OHLCV with bounded concurrency — provider-agnostic. */
export async function fetchMany(
  provider: DataProvider,
  symbols: readonly string[],
  period: Period,
  maxConcurrent = 8,
  opts?: OhlcvOptions,
): Promise<Map<string, OHLCV>> {
  const out = new Map<string, OHLCV>();
  const queue = [...symbols];

  async function worker(): Promise<void> {
    for (;;) {
      const sym = queue.shift();
      if (sym === undefined) return;
      try {
        const data = await provider.getOHLCV(sym, period, opts);
        if (data.bars.length > 0) out.set(sym, data);
      } catch {
        // skip failed symbols, matching the Python fetch_multiple behavior
      }
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrent, symbols.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return out;
}
