import type {
  DataProvider,
  OHLCV,
  Bar,
  Fundamentals,
  Financials,
  FinancialPoint,
  SectorVolumeSeries,
  Period,
  Clock,
} from '@screener/core';
import { TTLCache, SECTOR_STOCKS, fetchMany } from '@screener/core';
import { http, isTauri } from './http.js';

/**
 * Default free provider backed by Yahoo Finance public endpoints.
 *
 * On desktop (Tauri) we call Yahoo directly through the Rust HTTP layer (no
 * CORS). On the static web build, `baseUrl` points at a same-origin proxy
 * (see web-deploy/functions) that forwards to Yahoo and adds CORS headers.
 */
const RANGE_BY_PERIOD: Record<Period, string> = {
  '1mo': '1mo',
  '3mo': '3mo',
  '6mo': '6mo',
  '1y': '1y',
  '2y': '2y',
  '5y': '5y',
  max: 'max',
};

interface ChartResult {
  chart: {
    result?: Array<{
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
    error?: unknown;
  };
}

export interface YahooProviderOptions {
  /** Base URL for Yahoo's chart host. Desktop: direct; web: a proxy path. */
  chartBase?: string;
  quoteBase?: string;
  clock?: Clock;
  ttlMs?: number;
}

export class YahooProvider implements DataProvider {
  private ohlcvCache: TTLCache<OHLCV>;
  private fundCache: TTLCache<Fundamentals>;
  private finCache: TTLCache<Financials>;
  private chartBase: string;
  private quoteBase: string;

  constructor(opts: YahooProviderOptions = {}) {
    const clock = opts.clock ?? (() => Date.now());
    const ttl = opts.ttlMs ?? 15 * 60 * 1000; // 15 min, mirroring the Python cache
    this.ohlcvCache = new TTLCache<OHLCV>(ttl, clock);
    this.fundCache = new TTLCache<Fundamentals>(ttl, clock);
    this.finCache = new TTLCache<Financials>(ttl, clock);
    // On desktop hit Yahoo directly; on web go through the same-origin proxy.
    const direct = isTauri();
    this.chartBase =
      opts.chartBase ?? (direct ? 'https://query1.finance.yahoo.com' : '/api/yahoo');
    this.quoteBase =
      opts.quoteBase ?? (direct ? 'https://query2.finance.yahoo.com' : '/api/yahoo');
  }

  async getOHLCV(symbol: string, period: Period): Promise<OHLCV> {
    const key = `${symbol}:${period}`;
    const cached = this.ohlcvCache.get(key);
    if (cached) return cached;

    const range = RANGE_BY_PERIOD[period];
    const url = `${this.chartBase}/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?range=${range}&interval=1d&events=div%2Csplit`;
    const data = await http().getJson<ChartResult>(url);

    const result = data.chart.result?.[0];
    const bars: Bar[] = [];
    if (result?.timestamp) {
      const q = result.indicators.quote[0]!;
      const adj = result.indicators.adjclose?.[0]?.adjclose;
      for (let i = 0; i < result.timestamp.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = adj?.[i] ?? q.close?.[i];
        const v = q.volume?.[i];
        if (o == null || h == null || l == null || c == null || v == null) continue;
        const d = new Date(result.timestamp[i]! * 1000);
        bars.push({
          date: d.toISOString().slice(0, 10),
          open: o,
          high: h,
          low: l,
          close: c,
          volume: v,
        });
      }
    }
    const ohlcv: OHLCV = { symbol, bars };
    if (bars.length) this.ohlcvCache.set(key, ohlcv);
    return ohlcv;
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const cached = this.fundCache.get(symbol);
    if (cached) return cached;
    const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,price';
    const url = `${this.quoteBase}/v10/finance/quoteSummary/${encodeURIComponent(
      symbol,
    )}?modules=${modules}`;
    type QS = {
      quoteSummary: { result?: Array<Record<string, Record<string, { raw?: number } | unknown>>> };
    };
    const data = await http().getJson<QS>(url);
    const r = (data.quoteSummary.result?.[0] ?? {}) as Record<string, Record<string, { raw?: number; fmt?: string } | string>>;
    const raw = (mod: string, field: string): number | null => {
      const cell = r[mod]?.[field] as { raw?: number } | undefined;
      return cell && typeof cell.raw === 'number' ? cell.raw : null;
    };
    const str = (mod: string, field: string): string | null => {
      const cell = r[mod]?.[field];
      return typeof cell === 'string' ? cell : null;
    };
    const f: Fundamentals = {
      symbol,
      name: str('price', 'longName') ?? str('price', 'shortName'),
      shortName: str('price', 'shortName'),
      sector: str('assetProfile', 'sector'),
      industry: str('assetProfile', 'industry'),
      marketCap: raw('price', 'marketCap'),
      peRatio: raw('summaryDetail', 'trailingPE'),
      forwardPe: raw('summaryDetail', 'forwardPE'),
      eps: raw('defaultKeyStatistics', 'trailingEps'),
      forwardEps: raw('defaultKeyStatistics', 'forwardEps'),
      dividendYield: raw('summaryDetail', 'dividendYield'),
      beta: raw('summaryDetail', 'beta'),
      week52High: raw('summaryDetail', 'fiftyTwoWeekHigh'),
      week52Low: raw('summaryDetail', 'fiftyTwoWeekLow'),
      avgVolume: raw('summaryDetail', 'averageVolume'),
      profitMargin: raw('financialData', 'profitMargins'),
      revenueGrowth: raw('financialData', 'revenueGrowth'),
      roe: raw('financialData', 'returnOnEquity'),
      currency: str('price', 'currency'),
      website: str('assetProfile', 'website'),
      summary: str('assetProfile', 'longBusinessSummary'),
      currentPrice: raw('financialData', 'currentPrice') ?? raw('price', 'regularMarketPrice'),
    };
    this.fundCache.set(symbol, f);
    return f;
  }

  async getFinancials(symbol: string): Promise<Financials> {
    const cached = this.finCache.get(symbol);
    if (cached) return cached;
    const modules =
      'incomeStatementHistory,incomeStatementHistoryQuarterly,earnings';
    const url = `${this.quoteBase}/v10/finance/quoteSummary/${encodeURIComponent(
      symbol,
    )}?modules=${modules}`;
    type Stmt = { endDate?: { raw?: number }; totalRevenue?: { raw?: number }; netIncome?: { raw?: number } };
    type QS = {
      quoteSummary: {
        result?: Array<{
          incomeStatementHistory?: { incomeStatementHistory?: Stmt[] };
          incomeStatementHistoryQuarterly?: { incomeStatementHistory?: Stmt[] };
        }>;
      };
    };
    const data = await http().getJson<QS>(url);
    const r = data.quoteSummary.result?.[0];
    const toPoints = (rows?: Stmt[]): FinancialPoint[] =>
      (rows ?? [])
        .map((s) => ({
          period: s.endDate?.raw ? new Date(s.endDate.raw * 1000).toISOString().slice(0, 10) : '',
          revenue: s.totalRevenue?.raw ?? null,
          netIncome: s.netIncome?.raw ?? null,
          eps: null as number | null,
        }))
        .reverse(); // Yahoo returns newest-first; emit chronological
    const fin: Financials = {
      symbol,
      annual: toPoints(r?.incomeStatementHistory?.incomeStatementHistory),
      quarterly: toPoints(r?.incomeStatementHistoryQuarterly?.incomeStatementHistory),
    };
    this.finCache.set(symbol, fin);
    return fin;
  }

  async getSectorVolume(
    sector: string,
    period: Period,
    freq: 'weekly' | 'monthly',
  ): Promise<SectorVolumeSeries> {
    const symbols = SECTOR_STOCKS[sector] ?? [];
    const data = await fetchMany(this, symbols, period, 8);

    // Sum daily volume across the sector, aligned by date.
    const byDate = new Map<string, number>();
    for (const ohlcv of data.values()) {
      for (const b of ohlcv.bars) byDate.set(b.date, (byDate.get(b.date) ?? 0) + b.volume);
    }
    const daily = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

    // Resample to week-end / month buckets by summing.
    const buckets = new Map<string, number>();
    for (const [date, vol] of daily) {
      const key = freq === 'weekly' ? weekKey(date) : date.slice(0, 7);
      buckets.set(key, (buckets.get(key) ?? 0) + vol);
    }
    const points = [...buckets.entries()]
      .filter(([, v]) => v > 0)
      .map(([date, volume]) => ({ date: freq === 'monthly' ? `${date}-01` : date, volume }));

    return { sector, freq, period, points };
  }
}

/** ISO week-ending (Sunday) date key for weekly resampling. */
function weekKey(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 Sun..6 Sat
  const add = (7 - day) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}
