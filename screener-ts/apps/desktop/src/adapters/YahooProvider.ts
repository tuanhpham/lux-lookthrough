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

interface TimeseriesPoint {
  date: string;
  value: number;
}

interface ChartMeta {
  currency?: string;
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketVolume?: number;
}

interface ChartResult {
  chart: {
    result?: Array<{
      meta?: ChartMeta;
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
    // Retry once on transient failure so a single dropped request doesn't make
    // a symbol vanish from a universe scan (a cause of "missing" results).
    let data: ChartResult;
    try {
      data = await http().getJson<ChartResult>(url);
    } catch {
      data = await http().getJson<ChartResult>(url);
    }

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

  /**
   * Fundamentals. Yahoo's `quoteSummary` endpoint now requires a cookie+crumb
   * and returns 401 for anonymous requests, so we source what's reachable
   * without auth: name / price / currency / 52-week range from the chart `meta`,
   * and market cap + P/E + EPS from the (auth-free) fundamentals-timeseries.
   *
   * Yahoo no longer publishes margin/ROE/growth fields directly, but the raw
   * income-statement + balance-sheet lines ARE available, so we DERIVE:
   *   profitMargin = netIncome / totalRevenue
   *   roe          = netIncome / stockholdersEquity
   *   revenueGrowth = (rev[-1] - rev[-2]) / rev[-2]
   * Beta and dividend yield are not exposed anonymously → left null (UI shows —).
   */
  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const cached = this.fundCache.get(symbol);
    if (cached) return cached;

    // Price/name/currency/52w from chart meta.
    let meta: ChartMeta = {};
    try {
      const chartUrl = `${this.chartBase}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
      const chart = await http().getJson<ChartResult>(chartUrl);
      meta = chart.chart.result?.[0]?.meta ?? {};
    } catch {
      /* leave meta empty */
    }

    // Annual valuation + statement lines from fundamentals-timeseries.
    const ts = await this.fetchTimeseries(symbol, 'annual', [
      'annualMarketCap',
      'annualPeRatio',
      'annualDilutedEPS',
      'annualTotalRevenue',
      'annualNetIncome',
      'annualStockholdersEquity',
    ]).catch(() => ({} as Record<string, TimeseriesPoint[]>));
    const latest = (key: string): number | null => {
      const arr = ts[key];
      return arr && arr.length ? (arr[arr.length - 1]?.value ?? null) : null;
    };
    const prev = (key: string): number | null => {
      const arr = ts[key];
      return arr && arr.length >= 2 ? (arr[arr.length - 2]?.value ?? null) : null;
    };
    const safeDiv = (a: number | null, b: number | null): number | null =>
      a != null && b != null && b !== 0 ? a / b : null;

    const rev = latest('annualTotalRevenue');
    const revPrev = prev('annualTotalRevenue');
    const ni = latest('annualNetIncome');
    const equity = latest('annualStockholdersEquity');

    const f: Fundamentals = {
      symbol,
      name: meta.longName ?? meta.shortName ?? null,
      shortName: meta.shortName ?? null,
      sector: null,
      industry: null,
      marketCap: latest('annualMarketCap'),
      peRatio: latest('annualPeRatio'),
      forwardPe: null,
      eps: latest('annualDilutedEPS'),
      forwardEps: null,
      dividendYield: null,
      beta: null,
      week52High: meta.fiftyTwoWeekHigh ?? null,
      week52Low: meta.fiftyTwoWeekLow ?? null,
      avgVolume: meta.regularMarketVolume ?? null,
      profitMargin: safeDiv(ni, rev), // fraction (0–1), UI ×100
      revenueGrowth: revPrev != null && rev != null ? safeDiv(rev - revPrev, revPrev) : null,
      roe: safeDiv(ni, equity),
      currency: meta.currency ?? null,
      website: null,
      summary: null,
      currentPrice: meta.regularMarketPrice ?? null,
    };
    this.fundCache.set(symbol, f);
    return f;
  }

  /**
   * Revenue / net income / diluted EPS history (annual + quarterly) from the
   * auth-free `fundamentals-timeseries` endpoint. This is what powers the
   * fundamentals trend chart.
   */
  async getFinancials(symbol: string): Promise<Financials> {
    const cached = this.finCache.get(symbol);
    if (cached) return cached;

    const build = async (freq: 'annual' | 'quarterly'): Promise<FinancialPoint[]> => {
      const p = freq === 'annual' ? 'annual' : 'quarterly';
      const ts = await this.fetchTimeseries(symbol, freq, [
        `${p}TotalRevenue`,
        `${p}NetIncome`,
        `${p}DilutedEPS`,
      ]).catch(() => ({} as Record<string, TimeseriesPoint[]>));
      // Merge the three series on asOfDate.
      const byDate = new Map<string, FinancialPoint>();
      const ingest = (key: string, field: 'revenue' | 'netIncome' | 'eps') => {
        for (const pt of ts[key] ?? []) {
          const row = byDate.get(pt.date) ?? { period: pt.date, revenue: null, netIncome: null, eps: null };
          row[field] = pt.value;
          byDate.set(pt.date, row);
        }
      };
      ingest(`${p}TotalRevenue`, 'revenue');
      ingest(`${p}NetIncome`, 'netIncome');
      ingest(`${p}DilutedEPS`, 'eps');
      return [...byDate.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
    };

    const fin: Financials = {
      symbol,
      annual: await build('annual'),
      quarterly: await build('quarterly'),
    };
    this.finCache.set(symbol, fin);
    return fin;
  }

  /** Low-level fundamentals-timeseries fetch → { type: [{date, value}] }. */
  private async fetchTimeseries(
    symbol: string,
    _freq: 'annual' | 'quarterly',
    types: string[],
  ): Promise<Record<string, TimeseriesPoint[]>> {
    const url = `${this.chartBase}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
      symbol,
    )}?symbol=${encodeURIComponent(symbol)}&type=${types.join(',')}&period1=493590046&period2=2000000000`;
    type TS = {
      timeseries: {
        result?: Array<{
          meta: { type: string[] };
          timestamp?: number[];
          [k: string]: unknown;
        }>;
      };
    };
    const data = await http().getJson<TS>(url);
    const out: Record<string, TimeseriesPoint[]> = {};
    for (const block of data.timeseries.result ?? []) {
      const type = block.meta.type[0];
      if (!type) continue;
      const rows = block[type] as Array<{ asOfDate?: string; reportedValue?: { raw?: number } }> | undefined;
      if (!rows) continue;
      out[type] = rows
        .filter((r) => r && r.asOfDate && r.reportedValue?.raw != null)
        .map((r) => ({ date: r.asOfDate!, value: r.reportedValue!.raw! }));
    }
    return out;
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
