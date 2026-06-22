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
import { TTLCache } from '@screener/core';
import { http, isTauri } from './http.js';

/**
 * Vietnam data provider backed by VNDirect's public dchart API (the TradingView
 * UDF feed that powers their web charts). Unlike Yahoo — which only carries HOSE
 * — this covers **all three VN boards: HOSE, HNX and UPCoM**, by plain ticker.
 *
 * What it provides:
 *  - getOHLCV: full daily history (the screener's pattern/score engine only
 *    needs bars, so HNX/UPCoM screening works end-to-end).
 *  - getFundamentals: a minimal record (name/price/currency from the series).
 *    VNDirect's fundamentals host (finfo) is geo-restricted and TCBS's analysis
 *    endpoints are unreliable, so rich fundamentals (market cap, ROE, margins)
 *    are not sourced here — the UI shows "—" for those, which is honest.
 *  - getFinancials: empty (no verified free statement source for HNX/UPCoM).
 *  - getSectorVolume: not used (the Sectors tab computes VN volume client-side
 *    from already-fetched bars), so this returns an empty series.
 *
 * Endpoint: GET /dchart/history?symbol=FPT&resolution=D&from={sec}&to={sec}
 *   → { s:"ok", t:[unixSec], o:[], h:[], l:[], c:[], v:[] }   (parallel arrays)
 *
 * IMPORTANT: dchart prices are in **thousands of đồng** (pricescale 100, e.g.
 * SHS close 19.1 = 19,100 VND). We scale OHLC ×1000 so values match the rest of
 * the app (and the VND formatting in the UI). Volume is already in shares.
 *
 * The host sends `Access-Control-Allow-Origin: *`, so the web build can call it
 * directly; we still route through a same-origin `/api/vndirect` proxy on web
 * for resilience (and to match the Yahoo/Finnhub pattern). Desktop (Tauri) hits
 * it directly via the Rust HTTP layer.
 */

const PRICE_SCALE = 1000; // dchart quotes in thousands of VND

const DAYS_BY_PERIOD: Record<Period, number> = {
  '1mo': 31,
  '3mo': 93,
  '6mo': 186,
  '1y': 372,
  '2y': 744,
  '5y': 1860,
  max: 7300,
};

interface UdfHistory {
  s: string; // 'ok' | 'no_data' | 'error'
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
}

export interface VnDirectOptions {
  base?: string;
  clock?: Clock;
  ttlMs?: number;
}

export class VnDirectProvider implements DataProvider {
  private ohlcvCache: TTLCache<OHLCV>;
  private base: string;

  constructor(opts: VnDirectOptions = {}) {
    const clock = opts.clock ?? (() => Date.now());
    const ttl = opts.ttlMs ?? 15 * 60 * 1000; // 15 min, like the other providers
    this.ohlcvCache = new TTLCache<OHLCV>(ttl, clock);
    const direct = isTauri();
    this.base = opts.base ?? (direct ? 'https://dchart-api.vndirect.com.vn/dchart' : '/api/vndirect');
  }

  /** Strip any `.VN`/exchange suffix — dchart uses bare tickers (e.g. `FPT`). */
  private bare(symbol: string): string {
    return symbol.toUpperCase().replace(/\.(VN|HN|HNX|UP|UPCOM|HM)$/i, '');
  }

  async getOHLCV(symbol: string, period: Period): Promise<OHLCV> {
    const key = `${symbol}:${period}`;
    const cached = this.ohlcvCache.get(key);
    if (cached) return cached;

    const ticker = this.bare(symbol);
    const to = Math.floor(Date.now() / 1000);
    const from = to - DAYS_BY_PERIOD[period] * 86_400;
    const url = `${this.base}/history?symbol=${encodeURIComponent(ticker)}&resolution=D&from=${from}&to=${to}`;

    // Retry once on a transient failure so one dropped request doesn't make a
    // symbol vanish from a universe scan (mirrors YahooProvider).
    let data: UdfHistory;
    try {
      data = await http().getJson<UdfHistory>(url);
    } catch {
      data = await http().getJson<UdfHistory>(url);
    }

    const bars: Bar[] = [];
    if (data.s === 'ok' && data.t && data.c) {
      for (let i = 0; i < data.t.length; i++) {
        const o = data.o?.[i];
        const h = data.h?.[i];
        const l = data.l?.[i];
        const c = data.c?.[i];
        const v = data.v?.[i];
        if (o == null || h == null || l == null || c == null || v == null) continue;
        bars.push({
          date: new Date(data.t[i]! * 1000).toISOString().slice(0, 10),
          open: o * PRICE_SCALE,
          high: h * PRICE_SCALE,
          low: l * PRICE_SCALE,
          close: c * PRICE_SCALE,
          volume: v,
        });
      }
    }
    // dchart returns most-recent-first in some cases; the screener requires
    // ascending-by-date, so sort defensively.
    bars.sort((a, b) => (a.date < b.date ? -1 : 1));

    const ohlcv: OHLCV = { symbol, bars };
    if (bars.length) this.ohlcvCache.set(key, ohlcv);
    return ohlcv;
  }

  /**
   * Minimal fundamentals: name + last price + currency derived from the price
   * series. No free, reliable source exposes market cap / EPS / ROE / margins
   * for HNX/UPCoM, so those stay null and the UI shows "—".
   */
  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const ticker = this.bare(symbol);
    let currentPrice: number | null = null;
    let week52High: number | null = null;
    let week52Low: number | null = null;
    try {
      const ohlcv = await this.getOHLCV(symbol, '1y');
      if (ohlcv.bars.length) {
        currentPrice = ohlcv.bars[ohlcv.bars.length - 1]!.close;
        const highs = ohlcv.bars.map((b) => b.high);
        const lows = ohlcv.bars.map((b) => b.low);
        week52High = Math.max(...highs);
        week52Low = Math.min(...lows);
      }
    } catch {
      /* leave nulls */
    }
    return {
      symbol,
      name: ticker,
      shortName: ticker,
      sector: null,
      industry: null,
      marketCap: null,
      peRatio: null,
      forwardPe: null,
      eps: null,
      forwardEps: null,
      dividendYield: null,
      beta: null,
      week52High,
      week52Low,
      avgVolume: null,
      profitMargin: null,
      revenueGrowth: null,
      roe: null,
      currency: 'VND',
      website: null,
      summary: null,
      currentPrice,
    };
  }

  /** No verified free statement source for VN boards → empty (UI hides chart). */
  async getFinancials(symbol: string): Promise<Financials> {
    return { symbol, annual: [], quarterly: [] };
  }

  /** Sector volume is computed client-side for VN (see the Sectors tab). */
  async getSectorVolume(
    sector: string,
    period: Period,
    freq: 'weekly' | 'monthly',
  ): Promise<SectorVolumeSeries> {
    return { sector, freq, period, points: [] };
  }
}
