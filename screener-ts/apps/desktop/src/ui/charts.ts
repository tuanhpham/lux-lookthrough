import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  LineStyle,
} from 'lightweight-charts';
import type { Bar, PatternResult } from '@screener/core';
import { emaOfCloses } from '@screener/core';

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
  { period: 150, color: '#00d49b', on: true },
  { period: 200, color: '#ff5260', on: true },
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
  pattern: PatternResult | null,
  emaState: Record<number, boolean> = Object.fromEntries(EMA_CONFIG.map((e) => [e.period, e.on])),
): CandleChart {
  container.innerHTML = '';
  const chart = createChart(container, { ...themeOptions(), width: container.clientWidth, height: 280 });
  const candle = chart.addCandlestickSeries({
    upColor: '#00d49b', downColor: '#ff5260', borderVisible: false,
    wickUpColor: '#00d49b', wickDownColor: '#ff5260',
  });
  candle.setData(bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })));

  const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  vol.setData(
    bars.map((b) => ({ time: b.date, value: b.volume, color: b.close >= b.open ? '#00d49b44' : '#ff526044' })),
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

  if (pattern) {
    const lines: [number | null, string, string][] = [
      [pattern.pivot.pivotHigh, '#f5a623', 'Pivot'],
      [pattern.entryPrice, '#3b82f6', 'Entry'],
      [pattern.stopLoss, '#ff5260', 'Stop'],
      [pattern.targetPrice, '#00d49b', 'Target'],
    ];
    for (const [price, color, title] of lines) {
      if (price != null)
        candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
    }
  }
  chart.timeScale().fitContent();
  new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth })).observe(container);

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
      chart.remove();
    },
  };
}

export interface LineOptions {
  baseline?: number;
  /** Format the value axis as compact volume (1.2B / 340M / 5K) — matches the
   * backend's sector volume chart. */
  volume?: boolean;
  height?: number;
}

/** Area line chart (equity curve / sector volume). With `volume:true` the value
 * axis uses lightweight-charts' built-in B/M/K formatting and the time axis
 * shows dates. */
export function drawLine(
  container: HTMLElement,
  points: { time: string; value: number }[],
  options: LineOptions = {},
): IChartApi {
  const { baseline, volume = false, height = 240 } = options;
  container.innerHTML = '';
  const chart = createChart(container, {
    ...themeOptions(),
    width: container.clientWidth,
    height,
    // Show calendar dates on the time axis (year/month labels), not bar indices.
    timeScale: { ...themeOptions().timeScale, timeVisible: false, secondsVisible: false },
  });
  const line = chart.addAreaSeries({
    lineColor: '#00d49b',
    topColor: '#00d49b44',
    bottomColor: '#00d49b08',
    lineWidth: 2,
    ...(volume ? { priceFormat: { type: 'volume' as const } } : {}),
  });
  line.setData(points);
  if (baseline != null && points.length) {
    const base = chart.addLineSeries({ color: '#5b6577', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false });
    base.setData(points.map((p) => ({ time: p.time, value: baseline })));
  }
  chart.timeScale().fitContent();
  new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth })).observe(container);
  return chart;
}

export { EMA_CONFIG };
