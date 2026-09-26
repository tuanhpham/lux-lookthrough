/**
 * Small string-only candlestick renderer, for the illustrated figures on the
 * Learn tab's Swing Playbook.
 *
 * It returns SVG markup rather than drawing into a node, so a page can build its
 * whole figure set inside one template literal — the way every other tab here
 * composes HTML.
 *
 * Every colour is a CSS custom property written into a `style` attribute, never
 * a literal hex. That is the whole reason these figures follow the light/dark
 * toggle without being redrawn: `theme.ts` has to notify subscribers because a
 * canvas chart samples its colours once, at creation. A `var()` sitting in a
 * live style declaration has no such moment — the browser re-resolves it when
 * `html.light` flips.
 *
 * Deliberately NOT a presentation attribute (`fill="var(--accent)"`): those map
 * to CSS declarations and mostly do work, but the support story is thinner than
 * for `style`, and a figure that silently renders black in one browser is worse
 * than a slightly longer attribute.
 */

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
  /** Override the up/down body colour (a CSS var string). */
  color?: string;
  /** Fade the bar — used for context bars around the one being explained. */
  dim?: boolean;
  /** Draw a dashed ring around the bar, in this colour. The "look here" mark. */
  ring?: string;
  /** Volume bar is the loud one (breakout / signal bar). */
  vhi?: boolean;
  /** Volume bar is the quiet one (dry-up). */
  vlo?: boolean;
}

export interface Overlay {
  values: (number | null)[];
  color: string;
  width?: number;
  /** Drawn at the right edge, next to the line's last point. */
  label?: string;
}

export interface Level {
  y: number;
  color?: string;
  label?: string;
  dash?: string;
}

export interface Zone {
  /** Inclusive bar indices. */
  from: number;
  to: number;
  fill?: string;
  label?: string;
  color?: string;
}

export interface Note {
  i: number;
  at?: 'above' | 'below';
  text: string;
  color?: string;
  dy?: number;
  arrow?: boolean;
}

export interface CandleChartCfg {
  /** viewBox units, not pixels: the SVG is `width:100%` and scales. */
  width?: number;
  height?: number;
  volHeight?: number;
  showVolume?: boolean;
  data: Candle[];
  overlays?: Overlay[];
  levels?: Level[];
  zones?: Zone[];
  notes?: Note[];
  /** Accessible name. Figures without one are decorative. */
  title?: string;
}

const UP = 'var(--accent)';
const DOWN = 'var(--danger)';
const GRID = 'var(--border-soft)';
const AXIS = 'var(--border)';
const MUTE = 'var(--faint)';
const UI = 'var(--font-ui)';
const MONO = 'var(--font-mono)';

/** `color-mix` rather than rgba(): the base has to follow the theme. */
const wash = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const n1 = (x: number) => x.toFixed(1);

export function candleChart(cfg: CandleChartCfg): string {
  const W = cfg.width ?? 640;
  const H = cfg.height ?? 260;
  const volH = cfg.showVolume === false ? 0 : cfg.volHeight ?? 54;
  const padT = 14;
  const padB = 14;
  const padL = 8;
  const padR = 46;
  const priceH = H - volH - padT - padB - (volH ? 10 : 0);
  const d = cfg.data;
  const n = d.length;
  if (!n || priceH <= 0) return '';

  let lo = Math.min(...d.map((x) => x.l));
  let hi = Math.max(...d.map((x) => x.h));
  for (const o of cfg.overlays ?? []) {
    for (const v of o.values) {
      if (v == null) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  for (const l of cfg.levels ?? []) {
    lo = Math.min(lo, l.y);
    hi = Math.max(hi, l.y);
  }
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad;
  hi += pad;

  const cw = (W - padL - padR) / n;
  const bw = Math.max(2.5, cw * 0.58);
  const X = (i: number) => padL + cw * i + cw / 2;
  const Y = (p: number) => padT + priceH - ((p - lo) / (hi - lo)) * priceH;

  const maxV = Math.max(...d.map((x) => x.v ?? 0)) || 1;
  const volTop = padT + priceH + 10;
  const VY = (v: number) => volTop + volH - (v / maxV) * volH;

  let s = '';

  for (let g = 0; g <= 3; g++) {
    const y = padT + (priceH / 3) * g;
    s += `<line x1="${padL}" y1="${n1(y)}" x2="${W - padR + 4}" y2="${n1(y)}" stroke-width="1" stroke-dasharray="2 5" style="stroke:${GRID}"/>`;
  }

  for (const z of cfg.zones ?? []) {
    const x1 = padL + cw * z.from;
    const x2 = padL + cw * (z.to + 1);
    s += `<rect x="${n1(x1)}" y="${padT}" width="${n1(x2 - x1)}" height="${n1(priceH)}" style="fill:${z.fill ?? wash('var(--warn)', 7)}"/>`;
    if (z.label) {
      s += `<text x="${n1((x1 + x2) / 2)}" y="${padT + 13}" font-size="10" font-weight="700" text-anchor="middle" style="fill:${z.color ?? 'var(--warn)'};font-family:${UI};letter-spacing:.5px">${esc(z.label)}</text>`;
    }
  }

  for (const l of cfg.levels ?? []) {
    const y = Y(l.y);
    const col = l.color ?? MUTE;
    s += `<line x1="${padL}" y1="${n1(y)}" x2="${W - padR + 2}" y2="${n1(y)}" stroke-width="1.2" stroke-dasharray="${l.dash ?? '5 4'}" opacity=".85" style="stroke:${col}"/>`;
    if (l.label) {
      s += `<text x="${W - padR + 6}" y="${n1(y + 3.5)}" font-size="9.5" font-weight="700" style="fill:${col};font-family:${MONO}">${esc(l.label)}</text>`;
    }
  }

  for (const o of cfg.overlays ?? []) {
    let path = '';
    let started = false;
    o.values.forEach((v, i) => {
      if (v == null) return;
      path += `${started ? 'L' : 'M'}${n1(X(i))} ${n1(Y(v))} `;
      started = true;
    });
    if (!started) continue;
    s += `<path d="${path}" fill="none" stroke-width="${o.width ?? 1.6}" stroke-linejoin="round" opacity=".9" style="stroke:${o.color}"/>`;
    const last = o.values.filter((v): v is number => v != null).pop();
    if (o.label && last != null) {
      s += `<text x="${W - padR + 6}" y="${n1(Y(last) + 3.5)}" font-size="9.5" font-weight="700" style="fill:${o.color};font-family:${UI}">${esc(o.label)}</text>`;
    }
  }

  if (volH) {
    d.forEach((c, i) => {
      if (!c.v) return;
      const up = c.c >= c.o;
      let col = wash(up ? UP : DOWN, 42);
      if (c.vhi) col = wash(up ? UP : DOWN, 95);
      if (c.vlo) col = wash(MUTE, 32);
      const y = VY(c.v);
      s += `<rect x="${n1(X(i) - bw / 2)}" y="${n1(y)}" width="${n1(bw)}" height="${n1(volTop + volH - y)}" rx="1" style="fill:${col}"/>`;
    });
    s += `<line x1="${padL}" y1="${volTop + volH}" x2="${W - padR + 4}" y2="${volTop + volH}" stroke-width="1" style="stroke:${AXIS}"/>`;
    s += `<text x="${W - padR + 6}" y="${volTop + 11}" font-size="9" font-weight="700" style="fill:${MUTE};font-family:${UI}">VOL</text>`;
  }

  d.forEach((c, i) => {
    const up = c.c >= c.o;
    const col = c.color ?? (up ? UP : DOWN);
    const x = X(i);
    const op = c.dim ? ' opacity=".4"' : '';
    s += `<line x1="${n1(x)}" y1="${n1(Y(c.h))}" x2="${n1(x)}" y2="${n1(Y(c.l))}" stroke-width="1.3"${op} style="stroke:${col}"/>`;
    const top = Math.min(Y(c.o), Y(c.c));
    const hgt = Math.max(1.6, Math.abs(Y(c.c) - Y(c.o)));
    s += `<rect x="${n1(x - bw / 2)}" y="${n1(top)}" width="${n1(bw)}" height="${n1(hgt)}" rx="1"${op} style="fill:${col}"/>`;
    if (c.ring) {
      s += `<rect x="${n1(x - bw / 2 - 4)}" y="${n1(Y(c.h) - 5)}" width="${n1(bw + 8)}" height="${n1(Y(c.l) - Y(c.h) + 10)}" fill="none" stroke-width="1.4" rx="5" stroke-dasharray="3 3" style="stroke:${c.ring}"/>`;
    }
  });

  for (const a of cfg.notes ?? []) {
    const bar = d[a.i];
    if (!bar) continue;
    const below = a.at === 'below';
    const x = X(a.i);
    const y = below ? Y(bar.l) + (a.dy ?? 16) : Y(bar.h) - (a.dy ?? 14);
    const col = a.color ?? 'var(--warn)';
    if (a.arrow) {
      const dir = below ? -1 : 1;
      s += `<path d="M${n1(x)} ${n1(y + dir * 7)} l-4 ${dir * 6} h8 z" style="fill:${col}"/>`;
    }
    const ty = below ? y + (a.arrow ? 22 : 4) : y - (a.arrow ? 10 : 0);
    s += `<text x="${n1(x)}" y="${n1(ty)}" font-size="10" font-weight="700" text-anchor="middle" style="fill:${col};font-family:${UI}">${esc(a.text)}</text>`;
  }

  const label = cfg.title
    ? ` role="img" aria-label="${esc(cfg.title)}"`
    : ' role="presentation" aria-hidden="true"';
  return `<svg class="swp-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"${label}>${s}</svg>`;
}

/**
 * Seeded PRNG. Every figure draws from one of these so a given illustration is
 * byte-identical on every render — a chart that reshuffles itself on each tab
 * switch reads as a live feed, which these are emphatically not.
 */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export interface MkOpts {
  body?: number;
  wick?: number;
  vBase?: number;
  vJit?: number;
}

/**
 * Turn a close-price series into plausible OHLCV bars.
 *
 * Draws exactly four numbers from `rnd` per bar (open, high, low, volume) — the
 * caller's own `rnd` calls interleave with these, so the draw order is part of
 * the picture and must not be reordered.
 */
export function mkBars(closes: number[], rnd: () => number, opts: MkOpts = {}): Candle[] {
  const body = opts.body ?? 0.45;
  const wick = opts.wick ?? 0.5;
  const vBase = opts.vBase ?? 100;
  const vJit = opts.vJit ?? 0.3;
  const out: Candle[] = [];
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i]!;
    const prev = i ? closes[i - 1]! : c * 0.995;
    const move = c - prev;
    const amp = Math.max(Math.abs(move), c * 0.004);
    const o = prev + move * (rnd() * body - body / 2);
    const h = Math.max(o, c) + amp * wick * (0.4 + rnd() * 0.9);
    const l = Math.min(o, c) - amp * wick * (0.4 + rnd() * 0.9);
    out.push({ o, h, l, c, v: vBase * (0.75 + rnd() * vJit * 2) });
  }
  return out;
}

export function emaOf(vals: number[], p: number): (number | null)[] {
  const k = 2 / (p + 1);
  let e: number | null = null;
  return vals.map((v, i) => {
    e = e === null ? v : v * k + e * (1 - k);
    return i < p - 1 ? null : e;
  });
}

export function smaOf(vals: number[], p: number): (number | null)[] {
  return vals.map((_, i) =>
    i < p - 1 ? null : vals.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p,
  );
}
