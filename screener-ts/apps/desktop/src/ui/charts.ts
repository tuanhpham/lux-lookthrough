import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  LineStyle,
} from 'lightweight-charts';
import type { Bar } from '@screener/core';
import { emaOfCloses } from '@screener/core';

/** Trade-level price lines to overlay on the candle chart. Decoupled from any
 * particular scan result so it works with QM levels (or anything else). */
export interface TradeOverlay {
  pivot?: number | null;
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
}

// Chart series colors. lightweight-charts is canvas-based and needs literal hex
// (CSS vars don't resolve inside it), so we mirror the Refined Terminal palette
// tokens here: --up (#18d89a) / --down (#ff5266).
const UP = '#18d89a';
const DOWN = '#ff5266';

function themeOptions() {
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return {
    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('--subtext') },
    grid: { vertLines: { color: css('--border-soft') }, horzLines: { color: css('--border-soft') } },
    rightPriceScale: { borderColor: css('--border') },
    timeScale: { borderColor: css('--border') },
    crosshair: { mode: 1 as const },
  };
}

const EMA_CONFIG: { period: number; color: string; on: boolean }[] = [
  { period: 5, color: '#8a95a8', on: false },
  { period: 10, color: '#c084fc', on: false },
  { period: 21, color: '#3b82f6', on: false },
  { period: 50, color: '#f5a623', on: true },
  { period: 150, color: '#18d89a', on: true },
  { period: 200, color: '#ff5266', on: true },
];

export interface CandleChart {
  chart: IChartApi;
  setEma(period: number, on: boolean): void;
  destroy(): void;
}

/** Candlestick + volume + EMA overlays + trade-level price lines. */
export function drawCandles(
  container: HTMLElement,
  bars: Bar[],
  overlay: TradeOverlay | null,
  emaState: Record<number, boolean> = Object.fromEntries(EMA_CONFIG.map((e) => [e.period, e.on])),
): CandleChart {
  container.innerHTML = '';
  const chart = createChart(container, { ...themeOptions(), width: container.clientWidth, height: 280 });
  const candle = chart.addCandlestickSeries({
    upColor: UP, downColor: DOWN, borderVisible: false,
    wickUpColor: UP, wickDownColor: DOWN,
  });
  candle.setData(bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })));

  const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  vol.setData(
    bars.map((b) => ({ time: b.date, value: b.volume, color: b.close >= b.open ? UP + '44' : DOWN + '44' })),
  );

  const emaSeries = new Map<number, ISeriesApi<'Line'>>();
  const addEma = (period: number, color: string) => {
    const vals = emaOfCloses(bars, period);
    const data = bars
      .map((b, i) => ({ time: b.date, value: vals[i]! }))
      .filter((d) => !Number.isNaN(d.value));
    if (!data.length) return;
    const line = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    line.setData(data);
    emaSeries.set(period, line);
  };
  for (const e of EMA_CONFIG) if (emaState[e.period]) addEma(e.period, e.color);

  if (overlay) {
    const lines: [number | null | undefined, string, string][] = [
      [overlay.pivot, '#ffb648', 'Pivot'],
      [overlay.entry, '#5b8cff', 'Entry'],
      [overlay.stop, DOWN, 'Stop'],
      [overlay.target, UP, 'Target'],
    ];
    for (const [price, color, title] of lines) {
      if (price != null)
        candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
    }
  }
  chart.timeScale().fitContent();
  // Keep width in sync, but stop once disposed — a ResizeObserver that outlives
  // the chart calls applyOptions on a dead object → "Object is disposed".
  let disposed = false;
  const ro = new ResizeObserver(() => {
    if (disposed) return;
    try {
      chart.applyOptions({ width: container.clientWidth });
    } catch {
      disposed = true;
      ro.disconnect();
    }
  });
  ro.observe(container);

  return {
    chart,
    setEma(period, on) {
      const cfg = EMA_CONFIG.find((e) => e.period === period);
      if (!cfg) return;
      if (on && !emaSeries.has(period)) addEma(period, cfg.color);
      else if (!on && emaSeries.has(period)) {
        chart.removeSeries(emaSeries.get(period)!);
        emaSeries.delete(period);
      }
    },
    destroy() {
      disposed = true;
      ro.disconnect();
      chart.remove();
    },
  };
}

export interface LineOptions {
  baseline?: number;
  /** Format the value axis as compact volume (1.2B / 340M / 5K) — matches the
   * backend's sector volume chart. */
  volume?: boolean;
  /** Format the value axis as money (e.g. €50,123) — for the equity curve. */
  money?: boolean;
  /** Currency symbol for `money` mode (default €). */
  currency?: string;
  height?: number;
}

/**
 * Money axis label. Equity moves are usually small relative to the total, so we
 * show the FULL value with thousands separators (€50,080) — that keeps every
 * change visible. Only ≥ €1M collapses to compact form to avoid huge labels.
 */
function compactMoney(v: number, sym: string): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}${sym}${(a / 1e6).toFixed(2)}M`;
  return `${s}${sym}${Math.round(a).toLocaleString('en-US')}`;
}

/** Area line chart (equity curve / sector volume). With `volume:true` the value
 * axis uses lightweight-charts' built-in B/M/K formatting; with `money:true` it
 * uses a compact currency formatter and pads the scale so small equity changes
 * are readable rather than a flat line. The time axis shows calendar dates. */
export function drawLine(
  container: HTMLElement,
  points: { time: string; value: number }[],
  options: LineOptions = {},
): IChartApi {
  const { baseline, volume = false, money = false, currency = '€', height = 240 } = options;
  container.innerHTML = '';
  const base = themeOptions();
  const chart = createChart(container, {
    ...base,
    width: container.clientWidth,
    height,
    // Money mode: format the y-axis as compact currency so labels are readable.
    localization: money ? { priceFormatter: (v: number) => compactMoney(v, currency) } : undefined,
    // A touch of headroom top/bottom keeps small moves off the chart edges.
    rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: 0.18, bottom: 0.18 } },
    // Show calendar dates on the time axis (year/month labels), not bar indices.
    timeScale: { ...base.timeScale, timeVisible: false, secondsVisible: false },
  });
  const line = chart.addAreaSeries({
    lineColor: UP,
    topColor: UP + '44',
    bottomColor: UP + '08',
    lineWidth: 2,
    priceLineVisible: false,
    ...(volume ? { priceFormat: { type: 'volume' as const } } : {}),
    ...(money ? { priceFormat: { type: 'price' as const, precision: 0, minMove: 1 } } : {}),
  });
  line.setData(points);
  if (baseline != null && points.length) {
    const baseSeries = chart.addLineSeries({ color: '#5b6577', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
    baseSeries.setData(points.map((p) => ({ time: p.time, value: baseline })));
  }
  chart.timeScale().fitContent();
  // Self-disconnecting observer: if the chart was disposed (container re-rendered
  // or detached), stop instead of throwing "Object is disposed".
  const ro = new ResizeObserver(() => {
    if (!container.isConnected) {
      ro.disconnect();
      return;
    }
    try {
      chart.applyOptions({ width: container.clientWidth });
    } catch {
      ro.disconnect();
    }
  });
  ro.observe(container);
  return chart;
}

export { EMA_CONFIG };
