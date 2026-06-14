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
export interface DataProvider {
  getOHLCV(symbol: string, period: Period): Promise<OHLCV>;
  getFundamentals(symbol: string): Promise<Fundamentals>;
  getFinancials(symbol: string): Promise<Financials>;
  getSectorVolume(
    sector: string,
    period: Period,
    freq: 'weekly' | 'monthly',
  ): Promise<SectorVolumeSeries>;
}

/** Fetch many symbols' OHLCV with bounded concurrency — provider-agnostic. */
export async function fetchMany(
  provider: DataProvider,
  symbols: readonly string[],
  period: Period,
  maxConcurrent = 8,
): Promise<Map<string, OHLCV>> {
  const out = new Map<string, OHLCV>();
  const queue = [...symbols];

  async function worker(): Promise<void> {
    for (;;) {
      const sym = queue.shift();
      if (sym === undefined) return;
      try {
        const data = await provider.getOHLCV(sym, period);
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
