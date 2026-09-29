/**
 * Sector rank history — one line per sector ETF, rank on an INVERTED y-axis.
 *
 * ── Why inverted, and why that is the whole point ───────────────────────────
 * Rank 1 is the best sector, and it is drawn at the TOP. Plotted the normal way
 * round (1 at the bottom) the chart reads backwards: money rotating INTO a sector
 * makes its line fall. Every other chart in this app means "up is good", and one
 * chart that silently means the opposite is worse than no chart, because it is
 * read at a glance and the glance is wrong.
 *
 * ── Why a line chart of ranks rather than of returns ────────────────────────
 * A rank chart answers "where is money rotating" in one look, which is the actual
 * question Stage 2 exists to answer. Returns would answer "what went up", and the
 * two differ exactly when it matters: in a broad selloff every sector's return is
 * negative while the rotation is perfectly visible in the ranks.
 *
 * Returns an SVG string — same convention as `caseStudies/svgChart.ts`, so it can
 * be dropped into innerHTML with no canvas, no external JS and no layout pass.
 * Unlike that chart it uses `var(--…)` for grid/axis/text: it is only ever shown
 * inside the app (never exported standalone), so it should follow the theme rather
 * than freeze a dark palette.
 */

/** Columnar history exactly as `push.sectors_payload()` builds it. */
export interface RankHistory {
  /** Trading days, ascending. `YYYY-MM-DD`. */
  days?: string[];
  /**
   * `sym -> rank per day`, index-aligned with `days`. `null` means that session
   * had no row for this symbol — the VM was off, or the ETF was not yet in the
   * basket. The line must BREAK there, not interpolate: a straight segment across
   * a three-week gap is an assertion that nothing happened, which is a claim the
   * data does not support.
   */
  series?: Record<string, (number | null)[]>;
}

export interface RankChartOpts {
  width?: number;
  height?: number;
  /** Draw order and colour assignment. Defaults to the keys of `series`. */
  order?: string[];
  /** Symbols the user has switched off. They keep their colour slot. */
  hidden?: Set<string>;
  /** Drawn thicker and on top — today's top 3. */
  emphasis?: Set<string>;
  /** Shown when there is nothing to draw. */
  emptyText?: string;
  /**
   * `XLK` → `XLK — Technology`, for the hover title on each line. Injected rather
   * than looked up here: this module stays free of i18n so it can be unit-tested
   * and reused, and the caller already knows the language.
   */
  label?: (sym: string) => string;
  /**
   * Ranks 1..`bandTo` get a tinted band — the baskets stock picking is allowed to
   * look inside. Pass 0 for no band.
   */
  bandTo?: number;
}

/**
 * Eleven hues, hand-spaced rather than `i * 360/11`.
 *
 * An even split puts adjacent sectors ~33° apart, and in the yellow-green and
 * blue-cyan parts of the wheel 33° is not a distinguishable difference at 1.6px
 * stroke width — so two neighbouring lines become one. These are pulled apart
 * where the eye is weak and allowed closer where it is strong (the reds/purples).
 * Fixed saturation/lightness keeps every line legible against both the dark and
 * the light background, which a palette of theme tokens could not do: the app has
 * exactly one accent colour, and this chart needs eleven.
 */
const HUES = [152, 200, 42, 268, 0, 96, 180, 320, 24, 226, 292];

const hue = (i: number): string => `hsl(${HUES[i % HUES.length]} 70% 55%)`;

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** `2025-02-04` → `02-04`. The year is on the caption, not on every tick. */
const tick = (d: string): string => (d.length >= 10 ? d.slice(5) : d);

/**
 * Build one path per unbroken run of ranks. Returns a single `d` attribute using
 * `M` to start each run, so a gap in the data is a gap in the ink.
 */
function linePath(
  vals: readonly (number | null)[],
  x: (i: number) => number,
  y: (r: number) => number,
): string {
  const out: string[] = [];
  let open = false;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null) {
      open = false;
      continue;
    }
    out.push(`${open ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
    open = true;
  }
  return out.join(' ');
}

/** Index of the last day this symbol has a rank for, or -1. */
function lastIdx(vals: readonly (number | null)[]): number {
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i;
  return -1;
}

export function rankChartSvg(
  hist: RankHistory | null | undefined,
  opts: RankChartOpts = {},
): string {
  const W = opts.width ?? 860;
  const H = opts.height ?? 260;
  const days = hist?.days ?? [];
  const series = hist?.series ?? {};
  const order = opts.order?.length ? opts.order : Object.keys(series);
  const hidden = opts.hidden ?? new Set<string>();
  const emph = opts.emphasis ?? new Set<string>();

  // `meet`, not `none`: stretching the viewBox to the container width would stretch
  // the glyphs with it, and the rank labels and end-of-line tickers are the parts
  // that make the chart readable. Uniform scaling instead — on a phone the whole
  // chart shrinks, which is legible; a horizontally smeared "XLRE" is not.
  const shell = (body: string): string =>
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"`
    + ` preserveAspectRatio="xMidYMid meet"`
    + ` style="width:100%;height:auto;display:block">${body}</svg>`;

  if (days.length < 2 || !order.length) {
    return shell(
      `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--faint)"`
      + ` font-family="monospace" font-size="12">${esc(opts.emptyText ?? '')}</text>`,
    );
  }

  const padL = 26; // rank labels
  const padR = 52; // end-of-line rank + symbol labels
  const padT = 12;
  const padB = 20; // date ticks
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Worst rank actually present, not `order.length`: when a sector has no history
  // the axis would otherwise reserve a band of empty space at the bottom. Floor at
  // 2 so the divisor below cannot be zero on a one-sector store.
  let worst = 2;
  for (const s of order) {
    for (const v of series[s] ?? []) if (v != null && v > worst) worst = v;
  }

  const n = days.length;
  // Full width even for a single-day store: `n - 1` would divide by zero, and the
  // early return above already handles n < 2.
  const x = (i: number): number => padL + (i / (n - 1)) * plotW;
  const y = (r: number): number => padT + ((r - 1) / (worst - 1)) * plotH;

  const parts: string[] = [];

  // The leadership band: ranks 1..3 are the only baskets Stage 3 is allowed to pick
  // stocks inside, so the chart says where that boundary is instead of leaving the
  // reader to count gridlines. A line LEAVING this band is the event worth seeing.
  const bandTo = Math.min(opts.bandTo ?? 3, worst);
  if (bandTo >= 1) {
    const top = y(1) - 6;
    const bot = y(bandTo) + 6;
    parts.push(
      `<rect x="${padL}" y="${top.toFixed(1)}" width="${plotW.toFixed(1)}"`
      + ` height="${(bot - top).toFixed(1)}" rx="3"`
      + ` fill="color-mix(in srgb, var(--accent) 8%, transparent)"/>`,
      `<line x1="${padL}" y1="${bot.toFixed(1)}" x2="${(W - padR).toFixed(1)}"`
      + ` y2="${bot.toFixed(1)}" stroke="var(--accent)" stroke-width="1"`
      + ` stroke-dasharray="3 3" opacity="0.5"/>`,
    );
  }

  // Gridline on EVERY rank, but only every other one is labelled: the lines are what
  // let you read a rank off a crossing point, the labels are what would crowd.
  for (let r = 1; r <= worst; r++) {
    const yy = y(r);
    parts.push(
      `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${(W - padR).toFixed(1)}"`
      + ` y2="${yy.toFixed(1)}" stroke="var(--border)" stroke-width="1"`
      + ` opacity="${r % 2 ? 0.7 : 0.35}"/>`,
    );
    if (r % 2) {
      parts.push(
        `<text x="${padL - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end"`
        + ` fill="var(--faint)" font-family="monospace" font-size="9">${r}</text>`,
      );
    }
  }

  // Date ticks. One every ~110px of plot width rather than a fixed three: over 60
  // sessions, "first / middle / last" leaves the reader estimating where March was.
  const want = Math.max(2, Math.min(n, Math.floor(plotW / 110) + 1));
  const step = (n - 1) / (want - 1);
  const ticks = new Set<number>();
  for (let k = 0; k < want; k++) ticks.add(Math.round(k * step));
  for (const i of [...ticks].sort((a, b) => a - b)) {
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    parts.push(
      `<line x1="${x(i).toFixed(1)}" y1="${(H - padB).toFixed(1)}" x2="${x(i).toFixed(1)}"`
      + ` y2="${(H - padB + 3).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`,
      `<text x="${x(i).toFixed(1)}" y="${(H - 5).toFixed(1)}" text-anchor="${anchor}"`
      + ` fill="var(--faint)" font-family="monospace" font-size="9">${esc(tick(days[i]!))}</text>`,
    );
  }

  // Lines. Emphasised symbols are pushed last so they sit ON TOP of the rest —
  // with 11 lines in a 260px box, being underneath is the same as being invisible.
  const draw = (sym: string, i: number): string => {
    const vals = series[sym] ?? [];
    const d = linePath(vals, x, y);
    if (!d) return '';
    const on = emph.has(sym);
    const c = hue(i);
    const li = lastIdx(vals);
    const w = on ? 2.4 : 1.4;

    // The end of the line is where the reader looks first — that is today. A dot
    // plus the rank means the last value can be read without tracing back to the
    // axis, and the axis is on the other side of eleven crossing lines.
    const end = li < 0 ? '' :
      `<circle cx="${x(li).toFixed(1)}" cy="${y(vals[li]!).toFixed(1)}" r="${on ? 3 : 2.2}"`
      + ` fill="${c}"/>`
      + `<text x="${(W - padR + 5).toFixed(1)}" y="${(y(vals[li]!) + 3.2).toFixed(1)}"`
      + ` fill="${c}" font-family="monospace" font-size="9.5"`
      + `${on ? ' font-weight="700"' : ''}>${esc(sym)}</text>`;

    // A halo in the page background behind each stroke: where two sectors cross, the
    // upper line reads as continuous instead of the pair reading as an X of one hue.
    const halo = `<path d="${d}" fill="none" stroke="var(--bg)" stroke-width="${w + 2.4}"`
      + ` stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;

    // `<title>` is the native tooltip — no JS, works on the exported SVG too.
    const tip = opts.label ? opts.label(sym) : sym;
    return `<g><title>${esc(tip)}</title>${halo}`
      + `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}"`
      + ` stroke-linejoin="round" stroke-linecap="round" opacity="${on ? 1 : 0.8}"/>`
      + `${end}</g>`;
  };

  const plain: string[] = [];
  const top: string[] = [];
  order.forEach((sym, i) => {
    if (hidden.has(sym)) return;
    (emph.has(sym) ? top : plain).push(draw(sym, i));
  });
  parts.push(...plain, ...top);

  return shell(parts.join(''));
}

/** Colour of a symbol's line, so the toggle chips match the chart. */
export function rankChartColor(order: readonly string[], sym: string): string {
  const i = order.indexOf(sym);
  return hue(i < 0 ? 0 : i);
}
