import type {
  DataProvider,
  OHLCV,
  Bar,
  Fundamentals,
  Financials,
  SectorVolumeSeries,
  Period,
  Clock,
} from '@screener/core';
import { TTLCache, RateLimiter, SECTOR_STOCKS, fetchMany } from '@screener/core';
import { http, isTauri } from './http.js';

/**
 * Optional Finnhub adapter (fallback). The API key is read from config/env and
 * NEVER hardcoded. On the static web build, requests go through a same-origin
 * serverless proxy (`/api/finnhub/...`) that injects the key server-side so it
 * never reaches the browser; on desktop the key is read from app config and
 * sent via the Rust HTTP layer.
 *
 * Free tier is ~60 req/min, so all calls go through a RateLimiter.
 */
function periodToRange(period: Period, now: number): { from: number; to: number } {
  const day = 86_400;
  const days: Record<Period, number> = {
    '1mo': 31,
    '3mo': 93,
    '6mo': 186,
    '1y': 372,
    '2y': 744,
    '5y': 1860,
    max: 3650,
  };
  const to = Math.floor(now / 1000);
  return { from: to - days[period] * day, to };
}

export interface FinnhubOptions {
  apiKey?: string; // desktop only; omit on web (proxy injects it)
  base?: string;
  clock?: Clock;
  sleep?: (ms: number) => Promise<void>;
  ttlMs?: number;
}

export class FinnhubProvider implements DataProvider {
  private cache: TTLCache<OHLCV>;
  private limiter: RateLimiter;
  private base: string;
  private apiKey?: string;
  private clock: Clock;

  constructor(opts: FinnhubOptions = {}) {
    this.clock = opts.clock ?? (() => Date.now());
    const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    this.cache = new TTLCache<OHLCV>(opts.ttlMs ?? 15 * 60 * 1000, this.clock);
    this.limiter = new RateLimiter(1100, 1, this.clock, sleep); // ~55 req/min
    this.apiKey = opts.apiKey;
    this.base = opts.base ?? (isTauri() ? 'https://finnhub.io/api/v1' : '/api/finnhub');
  }

  private token(): string {
    // On web the proxy injects the token; on desktop it must be configured.
    return this.apiKey ? `&token=${encodeURIComponent(this.apiKey)}` : '';
  }

  async getOHLCV(symbol: string, period: Period): Promise<OHLCV> {
    const key = `${symbol}:${period}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { from, to } = periodToRange(period, this.clock());
    const url = `${this.base}/stock/candle?symbol=${encodeURIComponent(
      symbol,
    )}&resolution=D&from=${from}&to=${to}${this.token()}`;
    type Candle = { s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] };
    const data = await this.limiter.run(() => http().getJson<Candle>(url));
    const bars: Bar[] = [];
    if (data.s === 'ok' && data.t) {
      for (let i = 0; i < data.t.length; i++) {
        bars.push({
          date: new Date(data.t[i]! * 1000).toISOString().slice(0, 10),
          open: data.o![i]!,
          high: data.h![i]!,
          low: data.l![i]!,
          close: data.c![i]!,
          volume: data.v![i]!,
        });
      }
    }
    const ohlcv: OHLCV = { symbol, bars };
    if (bars.length) this.cache.set(key, ohlcv);
    return ohlcv;
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const url = `${this.base}/stock/profile2?symbol=${encodeURIComponent(symbol)}${this.token()}`;
    type Profile = { name?: string; finnhubIndustry?: string; marketCapitalization?: number; weburl?: string; currency?: string };
    const p = await this.limiter.run(() => http().getJson<Profile>(url));
    return {
      symbol,
      name: p.name ?? null,
      sector: null,
      industry: p.finnhubIndustry ?? null,
      marketCap: p.marketCapitalization ? p.marketCapitalization * 1_000_000 : null,
      website: p.weburl ?? null,
      currency: p.currency ?? null,
    };
  }

  async getFinancials(symbol: string): Promise<Financials> {
    // Scaffolded: free tier financials are limited; return empty series so the
    // UI degrades gracefully. (Upgrade path documented in README.)
    return { symbol, annual: [], quarterly: [] };
  }

  async getSectorVolume(
    sector: string,
    period: Period,
    freq: 'weekly' | 'monthly',
  ): Promise<SectorVolumeSeries> {
    const symbols = SECTOR_STOCKS[sector] ?? [];
    const data = await fetchMany(this, symbols, period, 1); // serialized by limiter anyway
    const byDate = new Map<string, number>();
    for (const ohlcv of data.values())
      for (const b of ohlcv.bars) byDate.set(b.date, (byDate.get(b.date) ?? 0) + b.volume);
    const points = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, volume]) => ({ date, volume }));
    return { sector, freq, period, points };
  }

  // Finnhub has a /stock/profile2 endpoint but it's behind a paid tier for
  // most symbols. Return nulls — the Yahoo path covers the common case.
  async getSectorLabel(_symbol: string): Promise<{ sector: string | null; industry: string | null }> {
    return { sector: null, industry: null };
  }
}
