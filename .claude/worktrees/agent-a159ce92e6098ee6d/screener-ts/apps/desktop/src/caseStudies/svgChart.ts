/**
 * Self-contained SVG candlestick chart for a case study — a candle window
 * centered on the key date, with EMAs, entry/stop/target price lines, and
 * dated markers (Entry ▲, Exit ✕, catalysts ◆). Returns an SVG string so the
 * SAME renderer drives both the on-page view and the exported HTML report
 * (no canvas snapshot, no external JS — crisp and printable).
 */
import type { Bar } from '@screener/core';
import { emaOfCloses } from '@screener/core';
import type { CaseStudy } from './store.js';

export interface CaseChartColors {
  up: string;
  down: string;
  grid: string;
  axis: string;
  text: string;
  ema50: string;
  ema200: string;
  entry: string;
  stop: string;
  target: string;
  catalyst: string;
}

/** Dark-theme palette mirroring the app's terminal tokens. The export embeds
 * these literally so the report looks right standalone. */
export const DARK_CHART_COLORS: CaseChartColors = {
  up: '#18d89a',
  down: '#ff5266',
  grid: '#1d222c',
  axis: '#5c6575',
  text: '#99a2b2',
  ema50: '#f5a623',
  ema200: '#ff5266',
  entry: '#5b8cff',
  stop: '#ff5266',
  target: '#18d89a',
  catalyst: '#c084fc',
};

/** Slice bars to ±windowMonths around the key date. */
export function windowBars(bars: readonly Bar[], keyDate: string, windowMonths: number): Bar[] {
  const start = new Date(keyDate + 'T00:00:00');
  start.setMonth(start.getMonth() - windowMonths);
  const end = new Date(keyDate + 'T00:00:00');
  end.setMonth(end.getMonth() + windowMonths);
  const lo = start.toISOString().slice(0, 10);
  const hi = end.toISOString().slice(0, 10);
  return bars.filter((b) => b.date >= lo && b.date <= hi);
}

const fmt = (v: number): string => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));

/**
 * Render the case-study chart as an SVG string.
 * @param bars   already windowed (use windowBars) and sorted ascending
 * @param study  the case study (levels, key date, exit, catalysts)
 */
export function caseSvgChart(
  bars: readonly Bar[],
  study: CaseStudy,
  opts: { width?: number; height?: number; colors?: CaseChartColors } = {},
): string {
  const W = opts.width ?? 860;
  const H = opts.height ?? 380;
  const c = opts.colors ?? DARK_CHART_COLORS;
  const padL = 6;
  const padR = 56; // room for the price axis labels
  const padT = 14;
  const padB = 60; // room for date axis + volume strip

  if (!bars.length) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${c.axis}" font-family="monospace" font-size="13">No price data for this window.</text></svg>`;
  }

  const plotW = W - padL - padR;
  const priceH = H - padT - padB; // candle area
  const volH = 38; // volume strip height (overlaps bottom of price area)
  const n = bars.length;
  const slot = plotW / n;
  const candleW = Math.max(Math.min(slot * 0.6, 9), 1);

  // Price scale spans the window's highs/lows, padded, and INCLUDES the trade
  // levels so the lines are always on-screen.
  const levelVals = [study.entry, study.stop, study.target, study.exitPrice].filter(
    (v): v is number => v != null,
  );
  const hi = Math.max(...bars.map((b) => b.high), ...levelVals);
  const lo = Math.min(...bars.map((b) => b.low), ...levelVals);
  const pad = (hi - lo) * 0.06 || 1;
  const maxP = hi + pad;
  const minP = lo - pad;
  const span = maxP - minP || 1;
  const maxVol = Math.max(...bars.map((b) => b.volume), 1);

  const x = (i: number): number => padL + (i + 0.5) * slot;
  const y = (p: number): number => padT + priceH - ((p - minP) / span) * priceH;
  const volY = (v: number): number => padT + priceH - (v / maxVol) * volH;

  // Index of the bar at/just before the key date (the centering target).
  const keyIdx = (() => {
    let idx = -1;
    for (let i = 0; i < n; i++) if (bars[i]!.date <= study.keyDate) idx = i;
    return idx;
  })();
  const exitIdx = study.exitDate
    ? (() => {
        let idx = -1;
        for (let i = 0; i < n; i++) if (bars[i]!.date <= study.exitDate!) idx = i;
        return idx;
      })()
    : -1;

  // ── Layers ──────────────────────────────────────────────────────────────
  const parts: string[] = [];

  // Horizontal grid + price labels (5 ticks).
  for (let t = 0; t <= 4; t++) {
    const p = minP + (span * t) / 4;
    const yy = y(p);
    parts.push(
      `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${c.grid}" stroke-width="1"/>`,
      `<text x="${(W - padR + 4).toFixed(1)}" y="${(yy + 3).toFixed(1)}" fill="${c.axis}" font-family="monospace" font-size="9">${fmt(p)}</text>`,
    );
  }

  // Volume strip (subtle, at the bottom of the price area).
  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    const vh = padT + priceH - volY(b.volume);
    const col = b.close >= b.open ? c.up : c.down;
    parts.push(
      `<rect x="${(x(i) - candleW / 2).toFixed(1)}" y="${volY(b.volume).toFixed(1)}" width="${candleW.toFixed(1)}" height="${Math.max(vh, 0).toFixed(1)}" fill="${col}" opacity="0.18"/>`,
    );
  }

  // EMAs (50, 200) when enough bars.
  const polyline = (vals: number[], color: string) => {
    const pts = vals
      .map((v, i) => (Number.isNaN(v) ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
    return pts ? `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.8"/>` : '';
  };
  if (n >= 50) parts.push(polyline(emaOfCloses(bars, 50), c.ema50));
  if (n >= 200) parts.push(polyline(emaOfCloses(bars, 200), c.ema200));

  // Candles.
  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    const bull = b.close >= b.open;
    const col = bull ? c.up : c.down;
    const bodyTop = y(Math.max(b.open, b.close));
    const bodyBot = y(Math.min(b.open, b.close));
    const bodyH = Math.max(bodyBot - bodyTop, 0.8);
    parts.push(
      `<line x1="${x(i).toFixed(1)}" y1="${y(b.high).toFixed(1)}" x2="${x(i).toFixed(1)}" y2="${y(b.low).toFixed(1)}" stroke="${col}" stroke-width="1"/>`,
      `<rect x="${(x(i) - candleW / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleW.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${col}"/>`,
    );
  }

  // Trade-level price lines (dashed) with right-edge labels.
  const levelLine = (price: number | null, color: string, label: string) => {
    if (price == null) return;
    const yy = y(price);
    parts.push(
      `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="5 3"/>`,
      `<text x="${padL + 3}" y="${(yy - 3).toFixed(1)}" fill="${color}" font-family="monospace" font-size="9" font-weight="700">${label} ${fmt(price)}</text>`,
    );
  };
  levelLine(study.target, c.target, 'TGT');
  levelLine(study.entry, c.entry, 'ENT');
  levelLine(study.stop, c.stop, 'STP');

  // Vertical key-date guide.
  if (keyIdx >= 0) {
    const kx = x(keyIdx);
    parts.push(
      `<line x1="${kx.toFixed(1)}" y1="${padT}" x2="${kx.toFixed(1)}" y2="${(padT + priceH).toFixed(1)}" stroke="${c.entry}" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>`,
    );
  }

  // Markers: Entry ▲ (key date), Exit ✕ (exit date), catalysts ◆ on their dates.
  const marker = (idx: number, glyph: string, color: string, label: string) => {
    if (idx < 0) return;
    const mx = x(idx);
    const my = y(bars[idx]!.low) + 14;
    parts.push(
      `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" fill="${color}" font-family="monospace" font-size="12" font-weight="700">${glyph}</text>`,
      `<text x="${mx.toFixed(1)}" y="${(my + 11).toFixed(1)}" text-anchor="middle" fill="${color}" font-family="monospace" font-size="8">${label}</text>`,
    );
  };
  marker(keyIdx, '▲', c.entry, 'ENTRY');
  if (exitIdx >= 0) marker(exitIdx, '✕', study.outcome === 'loss' ? c.stop : c.target, 'EXIT');

  // Catalyst flags along the top of the plot.
  for (const cat of study.catalysts) {
    let idx = -1;
    for (let i = 0; i < n; i++) if (bars[i]!.date <= cat.date) idx = i;
    if (idx < 0) continue;
    const cx = x(idx);
    parts.push(
      `<line x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${(padT + 8).toFixed(1)}" stroke="${c.catalyst}" stroke-width="1.4"/>`,
      `<text x="${cx.toFixed(1)}" y="${(padT + 7).toFixed(1)}" text-anchor="middle" fill="${c.catalyst}" font-family="monospace" font-size="9">◆</text>`,
    );
  }

  // Date axis: first, key, last.
  const dateLabel = (idx: number, anchor: 'start' | 'middle' | 'end') => {
    if (idx < 0 || idx >= n) return;
    parts.push(
      `<text x="${x(idx).toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="${anchor}" fill="${c.axis}" font-family="monospace" font-size="9">${bars[idx]!.date}</text>`,
    );
  };
  dateLabel(0, 'start');
  if (keyIdx > 1 && keyIdx < n - 2) dateLabel(keyIdx, 'middle');
  dateLabel(n - 1, 'end');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">${parts.join('')}</svg>`;
}
