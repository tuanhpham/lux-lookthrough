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

  const padL = 24; // rank labels
  const padR = 42; // end-of-line symbol labels
  const padT = 10;
  const padB = 18; // date ticks
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

  // Rank gridlines, every other rank so 11 sectors do not produce 11 grey lines.
  for (let r = 1; r <= worst; r += 2) {
    const yy = y(r);
    parts.push(
      `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${(W - padR).toFixed(1)}"`
      + ` y2="${yy.toFixed(1)}" stroke="var(--border)" stroke-width="1" opacity="0.7"/>`,
      `<text x="${padL - 5}" y="${(yy + 3).toFixed(1)}" text-anchor="end"`
      + ` fill="var(--faint)" font-family="monospace" font-size="9">${r}</text>`,
    );
  }

  // Date ticks: first, middle, last. More would collide at this width on a phone.
  const dateTick = (i: number, anchor: 'start' | 'middle' | 'end'): void => {
    parts.push(
      `<text x="${x(i).toFixed(1)}" y="${(H - 5).toFixed(1)}" text-anchor="${anchor}"`
      + ` fill="var(--faint)" font-family="monospace" font-size="9">${esc(tick(days[i]!))}</text>`,
    );
  };
  dateTick(0, 'start');
  if (n > 8) dateTick(Math.floor((n - 1) / 2), 'middle');
  dateTick(n - 1, 'end');

  // Lines. Emphasised symbols are pushed last so they sit ON TOP of the rest —
  // with 11 lines in a 260px box, being underneath is the same as being invisible.
  const draw = (sym: string, i: number): string => {
    const vals = series[sym] ?? [];
    const d = linePath(vals, x, y);
    if (!d) return '';
    const on = emph.has(sym);
    const c = hue(i);
    const li = lastIdx(vals);
    const label = li < 0 ? '' :
      `<text x="${(W - padR + 4).toFixed(1)}" y="${(y(vals[li]!) + 3).toFixed(1)}"`
      + ` fill="${c}" font-family="monospace" font-size="9"`
      + `${on ? ' font-weight="700"' : ''}>${esc(sym)}</text>`;
    return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${on ? 2.2 : 1.3}"`
      + ` stroke-linejoin="round" opacity="${on ? 1 : 0.75}"/>${label}`;
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
