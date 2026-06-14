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

/** Resolve `p`, or resolve to undefined after `ms` — so an optional, slow
 * best-effort call can never block the caller. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

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
        const rawClose = q.close?.[i];
        const v = q.volume?.[i];
        if (o == null || h == null || l == null || rawClose == null || v == null) continue;

        // Match yfinance `auto_adjust=True`: scale ALL of OHLC by the same
        // per-bar factor (adjClose / rawClose), leaving volume unadjusted.
        // Using adjClose for close while keeping raw O/H/L (the old bug) breaks
        // candles AND diverges from the backend's screener inputs.
        const adjClose = adj?.[i];
        const factor = adjClose != null && rawClose !== 0 ? adjClose / rawClose : 1;
        const d = new Date(result.timestamp[i]! * 1000);
        bars.push({
          date: d.toISOString().slice(0, 10),
          open: o * factor,
          high: h * factor,
          low: l * factor,
          close: (adjClose ?? rawClose),
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

    // Best-effort upgrade: quoteSummary (behind a cookie+crumb handshake the
    // proxy/Rust layer performs) adds sector, beta, dividend yield, ROE, profit
    // margin, and the company description. Time-bounded so a slow/stalled crumb
    // call (common behind a corporate proxy) can NEVER block the detail page —
    // if it doesn't answer in time we keep the timeseries-derived values.
    await withTimeout(this.enrichFromQuoteSummary(symbol, f), 6000);

    this.fundCache.set(symbol, f);
    return f;
  }

  private async enrichFromQuoteSummary(symbol: string, f: Fundamentals): Promise<void> {
    try {
      const modules = 'assetProfile,summaryDetail,defaultKeyStatistics,financialData,price';
      const url = `${this.quoteBase}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
      type Cell = { raw?: number };
      type QS = {
        quoteSummary?: {
          result?: Array<{
            assetProfile?: { sector?: string; industry?: string; longBusinessSummary?: string; website?: string };
            summaryDetail?: { beta?: Cell; dividendYield?: Cell; trailingPE?: Cell };
            defaultKeyStatistics?: { trailingEps?: Cell; forwardEps?: Cell };
            financialData?: { returnOnEquity?: Cell; profitMargins?: Cell; revenueGrowth?: Cell; currentPrice?: Cell };
            price?: { marketCap?: Cell; regularMarketPrice?: Cell; currency?: string };
          }>;
        };
      };
      const data = await http().getJson<QS>(url);
      const r = data.quoteSummary?.result?.[0];
      if (!r) return;
      const num = (c?: Cell): number | null => (c && typeof c.raw === 'number' ? c.raw : null);
      // Prefer authoritative quoteSummary values; keep derived ones as fallback.
      f.sector = r.assetProfile?.sector ?? f.sector;
      f.industry = r.assetProfile?.industry ?? f.industry;
      f.summary = r.assetProfile?.longBusinessSummary ?? f.summary;
      f.website = r.assetProfile?.website ?? f.website;
      f.beta = num(r.summaryDetail?.beta) ?? f.beta;
      f.dividendYield = num(r.summaryDetail?.dividendYield) ?? f.dividendYield;
      f.peRatio = num(r.summaryDetail?.trailingPE) ?? f.peRatio;
      f.eps = num(r.defaultKeyStatistics?.trailingEps) ?? f.eps;
      f.forwardEps = num(r.defaultKeyStatistics?.forwardEps) ?? f.forwardEps;
      f.roe = num(r.financialData?.returnOnEquity) ?? f.roe;
      f.profitMargin = num(r.financialData?.profitMargins) ?? f.profitMargin;
      f.revenueGrowth = num(r.financialData?.revenueGrowth) ?? f.revenueGrowth;
      f.marketCap = num(r.price?.marketCap) ?? f.marketCap;
      f.currentPrice = num(r.financialData?.currentPrice) ?? num(r.price?.regularMarketPrice) ?? f.currentPrice;
      f.currency = r.price?.currency ?? f.currency;
    } catch {
      /* keep derived values */
    }
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
