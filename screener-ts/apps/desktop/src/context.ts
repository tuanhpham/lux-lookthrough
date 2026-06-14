import type { DataProvider, Storage } from '@screener/core';
import { YahooProvider } from './adapters/YahooProvider.js';
import { FinnhubProvider } from './adapters/FinnhubProvider.js';
import { makeStorage } from './adapters/storage.js';

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

  constructor(config: AppConfig) {
    this.storage = makeStorage();
    this.data =
      config.provider === 'finnhub'
        ? new FinnhubProvider({ apiKey: config.finnhubApiKey })
        : new YahooProvider();
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
