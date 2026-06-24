import type { DataProvider, Storage } from '@screener/core';
import { YahooProvider } from './adapters/YahooProvider.js';
import { FinnhubProvider } from './adapters/FinnhubProvider.js';
import { VnDirectProvider } from './adapters/VnDirectProvider.js';
import { MarketRouterProvider } from './adapters/MarketRouterProvider.js';
import { makeStorage, SyncedStorage } from './adapters/storage.js';

export interface AppConfig {
  provider: 'yahoo' | 'finnhub';
  finnhubApiKey?: string;
}

/**
 * Wiring point: swaps the concrete DataProvider WITHOUT touching screener or
 * portfolio logic (they only depend on the DataProvider interface). The key is
 * read from config/env, never hardcoded.
 */
export class AppContext {
  readonly data: DataProvider;
  readonly storage: Storage;
  /** Same instance as `storage`, typed as SyncedStorage for the startup merge
   * and the sync-settings dialog (pull/merge, code changes). */
  readonly synced: SyncedStorage;

  constructor(config: AppConfig) {
    const storage = makeStorage() as SyncedStorage;
    this.storage = storage;
    this.synced = storage;
    const us =
      config.provider === 'finnhub'
        ? new FinnhubProvider({ apiKey: config.finnhubApiKey })
        : new YahooProvider();
    // Route VN-suffixed tickers (.VN/.HN/...) to VNDirect (covers HOSE+HNX+UPCoM);
    // everything else stays on the US provider. One ctx.data, two markets.
    this.data = new MarketRouterProvider(us, new VnDirectProvider());
  }
}

export function loadConfig(): AppConfig {
  // import.meta.env is populated by Vite; on desktop you can also read a file.
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
  return {
    provider: (env.VITE_DATA_PROVIDER as 'yahoo' | 'finnhub') ?? 'yahoo',
    finnhubApiKey: env.VITE_FINNHUB_API_KEY, // desktop-only; web uses the proxy
  };
}
