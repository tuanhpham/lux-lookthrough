/**
 * The illustrated figures for the Swing Playbook on the Learn tab.
 *
 * Kept apart from `swingPlaybook.ts` because the two read differently: that file
 * is prose and tables, this one is synthetic price series. Mixing them made the
 * playbook impossible to proof-read for language coverage.
 *
 * All data is INVENTED and deterministic — a seeded PRNG per figure, so the
 * "hammer at the 21 EMA" is the same hammer every render. These illustrate a
 * shape; they are never market data, and nothing here reads from the app's data
 * layer on purpose.
 */
import {
  candleChart,
  emaOf,
  mkBars,
  seeded,
  smaOf,
  type Candle,
  type Note,
} from '../ui/miniChart.js';

type Lang = 'en' | 'vi';
type Bi = { en: string; vi: string };
const tx = (b: Bi, lang: Lang) => b[lang] ?? b.en;

const UP = 'var(--accent)';
const DOWN = 'var(--danger)';
const GOLD = 'var(--warn)';
const BLUE = 'var(--blue)';
const VIOLET = 'var(--violet)';
const MUTE = 'var(--faint)';

const L = {
  entry: { en: 'entry', vi: 'vào' },
  buy: { en: 'BUY', vi: 'MUA' },
  sell: { en: 'SELL', vi: 'BÁN' },
  stop: { en: 'STOP', vi: 'STOP' },
  target: { en: 'TARGET', vi: 'MỤC TIÊU' },
  resistance: { en: 'RESISTANCE', vi: 'KHÁNG CỰ' },
} satisfies Record<string, Bi>;

/**
 * Wrap a chart (or a grid of them) in the figure chrome: title, caption, legend.
 * `body` is raw markup so a figure can hold one chart or a 2×2 grid.
 */
export function figure(opts: {
  title: string;
  caption?: string;
  body: string;
  legend?: { color: string; text: string }[];
}): string {
  const legend = opts.legend?.length
    ? `<div class="swp-legend">${opts.legend
        .map((k) => `<span class="swp-key"><i style="background:${k.color}"></i>${k.text}</span>`)
        .join('')}</div>`
    : '';
  return `<figure class="swp-fig">
    <div class="swp-fig-t">${opts.title}</div>
    ${opts.caption ? `<div class="swp-fig-c">${opts.caption}</div>` : ''}
    ${opts.body}
    ${legend}
  </figure>`;
}

/** One labelled cell inside a multi-chart figure. */
function cell(label: string, color: string, svg: string, note = ''): string {
  return `<div><div class="swp-cell-t" style="color:${color}">${label}</div>${svg}${
    note ? `<p class="swp-cell-n">${note}</p>` : ''
  }</div>`;
}

// ── 1. The four market regimes ──────────────────────────────────────────────

function regimeSeries(kind: 'up' | 'down' | 'range' | 'stress'): number[] {
  const rnd = seeded(kind.length * 137 + 11);
  const out: number[] = [];
  let p = 100;
  for (let i = 0; i < 70; i++) {
    let drift = 0;
    if (kind === 'up') drift = 0.42 + Math.sin(i / 7) * 0.55;
    if (kind === 'down') drift = -0.42 + Math.sin(i / 7) * 0.55;
    if (kind === 'range') drift = Math.sin(i / 6.2) * 1.5 + Math.sin(i / 2.4) * 0.5;
    if (kind === 'stress') drift = (i < 45 ? 0.45 : -0.75) + Math.sin(i / 6) * 0.6;
    p += drift + (rnd() - 0.5) * 0.8;
    out.push(p);
  }
  return out;
}

const REGIME_CELLS: { kind: 'up' | 'down' | 'range' | 'stress'; color: string; label: Bi }[] = [
  {
    kind: 'up',
    color: UP,
    label: {
      en: 'UPTREND — price above both MAs, 50MA sloping up',
      vi: 'UPTREND — giá trên cả hai MA, 50MA dốc lên',
    },
  },
  {
    kind: 'down',
    color: DOWN,
    label: {
      en: 'DOWNTREND — price below both MAs, 50MA sloping down',
      vi: 'DOWNTREND — giá dưới cả hai MA, 50MA dốc xuống',
    },
  },
  {
    kind: 'range',
    color: GOLD,
    label: { en: 'RANGE — 50MA flat, price cutting back and forth', vi: 'RANGE — 50MA đi ngang, giá cắt qua lại' },
  },
  {
    kind: 'stress',
    color: VIOLET,
    label: {
      en: 'UNDER STRESS — 50MA still above 200MA but price has lost the 50MA',
      vi: 'UNDER STRESS — 50MA còn trên 200MA nhưng giá đã thủng 50MA',
    },
  },
];

export function regimeFigure(lang: Lang): string {
  const cells = REGIME_CELLS.map((r) => {
    const cl = regimeSeries(r.kind);
    const rnd = seeded(r.kind.length * 4099 + 7);
    const d = mkBars(cl, rnd, { vBase: 60, wick: 0.55 });
    return cell(
      tx(r.label, lang),
      r.color,
      candleChart({
        width: 520,
        height: 150,
        showVolume: false,
        data: d,
        overlays: [
          { values: smaOf(cl, 14), color: BLUE, width: 1.7, label: '50' },
          { values: smaOf(cl, 30), color: VIOLET, width: 1.7, label: '200' },
        ],
      }),
    );
  }).join('');
  return figure({
    title: lang === 'vi' ? '📈 Hình 1 — Bốn trạng thái thị trường trông như thế nào' : '📈 Figure 1 — What the four market states look like',
    caption:
      lang === 'vi'
        ? 'Cùng một cách đọc: vị trí giá so với 50MA/200MA, cộng với độ dốc của 50MA.'
        : 'One reading, every time: where price sits against the 50MA/200MA, plus the slope of the 50MA.',
    body: `<div class="swp-grid swp-g2">${cells}</div>`,
    legend: [
      { color: BLUE, text: '50MA' },
      { color: VIOLET, text: '200MA' },
    ],
  });
}

// ── 2. Low vs high volatility, same 1% risk ─────────────────────────────────

export function volFigure(lang: Lang): string {
  const rnd = seeded(42);
  const n = 46;
  const lowC: number[] = [];
  const highC: number[] = [];
  let a = 100;
  let b = 100;
  for (let i = 0; i < n; i++) {
    a += 0.3 + (rnd() - 0.5) * 0.55;
    b += 0.3 + (rnd() - 0.5) * 3.4;
    lowC.push(a);
    highC.push(b);
  }
  const dl = mkBars(lowC, rnd, { wick: 0.5, vBase: 55 });
  const dh = mkBars(highC, rnd, { wick: 0.9, vBase: 55 });
  const lastL = lowC[n - 1]!;
  const lastH = highC[n - 1]!;
  const entry = tx(L.entry, lang);

  const left = candleChart({
    width: 500,
    height: 160,
    showVolume: false,
    data: dl,
    overlays: [{ values: emaOf(lowC, 21), color: GOLD, width: 1.6, label: '21' }],
    levels: [
      { y: lastL, color: UP, label: entry, dash: '6 3' },
      { y: lastL * 0.97, color: DOWN, label: 'stop −3%', dash: '4 4' },
    ],
  });
  const right = candleChart({
    width: 500,
    height: 160,
    showVolume: false,
    data: dh,
    overlays: [{ values: emaOf(highC, 21), color: GOLD, width: 1.6, label: '21' }],
    levels: [
      { y: lastH, color: UP, label: entry, dash: '6 3' },
      { y: lastH * 0.92, color: DOWN, label: 'stop −8%', dash: '4 4' },
    ],
  });

  return figure({
    title:
      lang === 'vi'
        ? '📊 Hình 2 — Cùng một tỷ lệ rủi ro, hai môi trường biến động'
        : '📊 Figure 2 — Same risk percentage, two volatility regimes',
    caption:
      lang === 'vi'
        ? 'Bên trái: ATR thấp, stop gần → mua được nhiều. Bên phải: ATR cao, stop xa → phải mua ít lại. <b>Số tiền mất nếu sai là như nhau.</b>'
        : 'Left: low ATR, tight stop → more shares. Right: high ATR, wide stop → fewer shares. <b>The money lost if wrong is identical.</b>',
    body: `<div class="swp-grid swp-g2">
      ${cell(lang === 'vi' ? 'ATR THẤP · stop 3% · size 100%' : 'LOW ATR · 3% stop · 100% size', BLUE, left)}
      ${cell(lang === 'vi' ? 'ATR CAO · stop 8% · size 37%' : 'HIGH ATR · 8% stop · 37% size', DOWN, right)}
    </div>`,
  });
}

// ── 3. Sector rotation ranks ────────────────────────────────────────────────

/**
 * Rank-over-time lines, not candles — so this one builds its own SVG. Rank 1 is
 * at the top, which is why `Y` runs the opposite way to a price axis.
 */
export function rotationFigure(lang: Lang): string {
  const W = 760;
  const H = 250;
  const padL = 16;
  const padR = 70;
  const padT = 34;
  const padB = 26;
  const secs = [
    { n: 'XLK', c: UP, path: [6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1] },
    { n: 'XLI', c: BLUE, path: [4, 4, 3, 3, 3, 2, 2, 2, 3, 3, 2, 2] },
    { n: 'XLF', c: GOLD, path: [9, 8, 8, 7, 7, 6, 5, 5, 4, 4, 4, 4] },
    { n: 'XLE', c: DOWN, path: [1, 1, 2, 2, 2, 3, 4, 5, 6, 7, 8, 8] },
    { n: 'XLU', c: VIOLET, path: [11, 11, 10, 10, 9, 9, 8, 7, 6, 5, 4, 3] },
    { n: 'XLY', c: MUTE, path: [3, 3, 4, 4, 5, 5, 6, 6, 5, 5, 6, 6] },
  ];
  const N = secs[0]!.path.length;
  const X = (i: number) => padL + (W - padL - padR) * (i / (N - 1));
  const Y = (r: number) => padT + ((r - 1) / 10) * (H - padT - padB);
  const f = (x: number) => x.toFixed(1);

  let s = '';
  for (let r = 1; r <= 11; r += 2) {
    s += `<line x1="${padL}" y1="${f(Y(r))}" x2="${W - padR}" y2="${f(Y(r))}" stroke-width="1" stroke-dasharray="2 5" style="stroke:var(--border-soft)"/>`;
    s += `<text x="${padL - 5}" y="${f(Y(r) + 3.5)}" font-size="9" text-anchor="end" style="fill:${MUTE};font-family:var(--font-mono)">${r}</text>`;
  }
  s += `<rect x="${padL}" y="${f(Y(1) - 9)}" width="${W - padL - padR}" height="${f(Y(3) - Y(1) + 18)}" style="fill:color-mix(in srgb, ${UP} 7%, transparent)"/>`;
  s += `<text x="${W - padR - 6}" y="${f(Y(1) - 15)}" font-size="10" font-weight="700" text-anchor="end" style="fill:${UP};font-family:var(--font-ui)">${
    lang === 'vi' ? 'VÙNG TOP 3 — chỉ săn cổ phiếu ở đây' : 'TOP-3 ZONE — only hunt names here'
  }</text>`;
  for (const se of secs) {
    let p = '';
    se.path.forEach((r, i) => {
      p += `${i ? 'L' : 'M'}${f(X(i))} ${f(Y(r))} `;
    });
    s += `<path d="${p}" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" opacity=".92" style="stroke:${se.c}"/>`;
    se.path.forEach((r, i) => {
      if (i % 3 === 0 || i === N - 1) {
        s += `<circle cx="${f(X(i))}" cy="${f(Y(r))}" r="2.6" style="fill:${se.c}"/>`;
      }
    });
    const last = se.path[N - 1]!;
    const delta = se.path[0]! - last;
    const tag = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '—';
    s += `<text x="${W - padR + 7}" y="${f(Y(last) + 4)}" font-size="10.5" font-weight="700" style="fill:${se.c};font-family:var(--font-ui)">${se.n} ${tag}</text>`;
  }
  const ticks = lang === 'vi' ? ['-90p', '-60p', '-30p', 'hôm nay'] : ['-90d', '-60d', '-30d', 'today'];
  ticks.forEach((lab, i) => {
    s += `<text x="${f(X((i * (N - 1)) / 3))}" y="${H - 7}" font-size="9.5" text-anchor="middle" style="fill:${MUTE};font-family:var(--font-ui)">${lab}</text>`;
  });

  return figure({
    title:
      lang === 'vi'
        ? '🔄 Hình 3 — Biểu đồ xoay vòng thứ hạng sector (90 phiên)'
        : '🔄 Figure 3 — Sector rank rotation (90 sessions)',
    caption:
      lang === 'vi'
        ? 'Trục dọc là thứ hạng (1 ở trên cùng). Điều đáng nhìn không phải ai đang đứng đầu, mà <b>đường nào đang đi lên</b>. XLK và XLI đang hút dòng tiền; XLU leo vào top là tín hiệu phòng thủ.'
        : 'The vertical axis is rank (1 at the top). What matters is not who leads but <b>which line is climbing</b>. XLK and XLI are pulling money in; XLU climbing into the top is a defensive tell.',
    body: `<svg class="swp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${
      lang === 'vi' ? 'Thứ hạng sector theo thời gian' : 'Sector ranks over time'
    }">${s}</svg>`,
  });
}

// ── 4. Pullback ─────────────────────────────────────────────────────────────

export function pullbackChart(lang: Lang): string {
  const rnd = seeded(99);
  const cl: number[] = [];
  let p = 100;
  for (let i = 0; i < 18; i++) {
    p += 0.62 + (rnd() - 0.5) * 0.7;
    cl.push(p);
  }
  for (let i = 0; i < 5; i++) {
    p -= 1.05 + (rnd() - 0.5) * 0.3;
    cl.push(p);
  }
  const lowPt = p;
  cl.push(p + 0.25);
  for (let i = 0; i < 9; i++) {
    p += 0.95 + (rnd() - 0.5) * 0.5;
    cl.push(p + 1.2);
  }
  const d = mkBars(cl, rnd, { vBase: 70, wick: 0.5 });
  const sig = 23;
  for (let i = 18; i < 23; i++) {
    d[i]!.v = 36 - (i - 18) * 4.5;
    d[i]!.vlo = true;
  }
  for (let i = 0; i < 18; i++) d[i]!.v = 66 + rnd() * 38;
  for (let i = 24; i < d.length; i++) {
    d[i]!.v = 88 + rnd() * 36;
    d[i]!.vhi = true;
  }
  // The signal bar, forced into a clean hammer: this is the one bar the whole
  // figure exists to show, so it is not left to the PRNG.
  const s = d[sig]!;
  s.o = lowPt + 0.05;
  s.c = lowPt + 0.9;
  s.h = lowPt + 1.05;
  s.l = lowPt - 1.75;
  s.v = 155;
  s.vhi = true;
  s.ring = GOLD;
  d[sig + 1]!.v = 140;
  d[sig + 1]!.vhi = true;

  return candleChart({
    width: 760,
    height: 290,
    volHeight: 52,
    title: lang === 'vi' ? 'Cấu trúc pullback trong xu hướng tăng' : 'Pullback-in-uptrend structure',
    data: d,
    overlays: [
      { values: emaOf(cl, 8), color: BLUE, width: 1.6 },
      { values: emaOf(cl, 16), color: GOLD, width: 1.8 },
    ],
    zones: [
      {
        from: 18,
        to: 22,
        fill: 'color-mix(in srgb, var(--faint) 12%, transparent)',
        label: lang === 'vi' ? 'VOLUME CẠN' : 'VOLUME DRIES UP',
        color: 'var(--subtext)',
      },
    ],
    levels: [
      { y: s.h, color: UP, label: tx(L.buy, lang), dash: '6 3' },
      { y: s.l, color: DOWN, label: tx(L.stop, lang), dash: '4 4' },
      { y: s.h + (s.h - s.l) * 2, color: BLUE, label: '2R', dash: '2 5' },
    ],
    notes: [
      {
        i: sig,
        at: 'below',
        arrow: true,
        dy: 6,
        color: GOLD,
        text: lang === 'vi' ? 'Nến tín hiệu → mua khi vượt đỉnh nến này' : 'Signal bar → buy above its high',
      },
    ],
  });
}

// ── 5. Breakout ─────────────────────────────────────────────────────────────

export function breakoutChart(lang: Lang): string {
  const rnd = seeded(1234);
  const cl: number[] = [];
  let p = 100;
  for (let i = 0; i < 8; i++) {
    p += 0.9 + (rnd() - 0.5) * 0.6;
    cl.push(p);
  }
  const res = p + 0.6;
  for (let i = 0; i < 22; i++) {
    const amp = 2.6 * (1 - i / 28);
    cl.push(res - 1.4 + Math.sin(i / 1.9) * amp + (rnd() - 0.5) * 0.35);
  }
  const bo = cl.length;
  for (let i = 0; i < 9; i++) cl.push(res + 1.5 + i * 1.35 + (rnd() - 0.5) * 0.7);
  const d = mkBars(cl, rnd, { vBase: 70, wick: 0.45 });
  for (let i = 8; i < 30; i++) {
    d[i]!.v = 46 - (i - 8) * 1.3;
    d[i]!.vlo = true;
  }
  d[bo]!.v = 190;
  d[bo]!.vhi = true;
  d[bo]!.ring = UP;
  d[bo + 1]!.v = 150;
  d[bo + 1]!.vhi = true;
  const height = 3.4;

  return candleChart({
    width: 760,
    height: 290,
    volHeight: 52,
    title: lang === 'vi' ? 'Cấu trúc breakout khỏi nền tích lũy' : 'Breakout-from-base structure',
    data: d,
    overlays: [{ values: emaOf(cl, 10), color: BLUE, width: 1.6 }],
    zones: [
      {
        from: 8,
        to: 29,
        fill: `color-mix(in srgb, ${BLUE} 8%, transparent)`,
        label: lang === 'vi' ? 'NỀN TÍCH LŨY — BIÊN ĐỘ THU HẸP' : 'BASE — RANGE TIGHTENING',
        color: BLUE,
      },
    ],
    levels: [
      { y: res, color: GOLD, label: tx(L.resistance, lang), dash: '6 3' },
      { y: res - height, color: DOWN, label: tx(L.stop, lang), dash: '4 4' },
      { y: res + height * 2.2, color: UP, label: tx(L.target, lang), dash: '2 5' },
    ],
    notes: [
      {
        i: bo,
        at: 'below',
        arrow: true,
        dy: 6,
        color: UP,
        text: lang === 'vi' ? 'Phá + vol 1,5×' : 'Break + vol 1.5×',
      },
    ],
  });
}

// ── 6. VCP ──────────────────────────────────────────────────────────────────

export function vcpChart(lang: Lang): string {
  const rnd = seeded(555);
  const cl: number[] = [];
  let p = 100;
  for (let i = 0; i < 7; i++) {
    p += 1.1;
    cl.push(p);
  }
  const legs: [number, number][] = [
    [10, 6],
    [7, 5],
    [5, 4],
    [3, 4],
  ];
  let base = p;
  const marks: { i: number; pct: number }[] = [];
  for (const [pct, bars] of legs) {
    const depth = (base * pct) / 100;
    for (let i = 0; i < bars; i++) cl.push(base - (depth * (i + 1)) / bars + (rnd() - 0.5) * 0.25);
    marks.push({ i: cl.length - 1, pct });
    for (let i = 0; i < bars; i++) cl.push(base - depth + (depth * (i + 1)) / bars + (rnd() - 0.5) * 0.25);
    base = base * 0.997;
  }
  const pivot = cl.length;
  for (let i = 0; i < 8; i++) cl.push(base + 1.0 + i * 1.5 + (rnd() - 0.5) * 0.6);
  const d = mkBars(cl, rnd, { vBase: 80, wick: 0.4 });
  for (let i = 7; i < pivot; i++) {
    d[i]!.v = 78 * (1 - ((i - 7) / (pivot - 7)) * 0.82);
    d[i]!.vlo = true;
  }
  d[pivot]!.v = 175;
  d[pivot]!.vhi = true;
  d[pivot]!.ring = GOLD;
  const lastLow = Math.min(...cl.slice(pivot - 8, pivot));

  const notes: Note[] = marks.map((m) => ({
    i: m.i,
    at: 'below',
    dy: 14,
    color: 'var(--subtext)',
    text: `−${m.pct}%`,
  }));
  notes.push({
    i: pivot - 4,
    at: 'above',
    dy: 26,
    color: UP,
    text: lang === 'vi' ? 'Volume cạn kiệt → phá pivot' : 'Volume dries up → pivot breaks',
  });

  return candleChart({
    width: 760,
    height: 290,
    volHeight: 52,
    title: lang === 'vi' ? 'Cấu trúc VCP — các đợt điều chỉnh thu hẹp dần' : 'VCP structure — contractions tightening',
    data: d,
    overlays: [{ values: emaOf(cl, 21), color: GOLD, width: 1.6 }],
    levels: [
      { y: base + 0.9, color: UP, label: 'PIVOT', dash: '6 3' },
      { y: lastLow, color: DOWN, label: tx(L.stop, lang), dash: '4 4' },
    ],
    notes,
  });
}

// ── 7. Mean reversion ───────────────────────────────────────────────────────

export function meanRevChart(lang: Lang): string {
  const rnd = seeded(2026);
  const hi = 106;
  const lo = 94;
  const cl = [
    100, 102.4, 104.3, 103.1, 100.6, 98.2, 96.6, 97.6, 100.1, 102.6, 104.4, 105.1, 104.0, 102.1,
    100.4, 98.6, 97.1, 95.9, 95.1, 94.7,
  ];
  const sig = cl.length;
  cl.push(95.3);
  for (const v of [96.6, 97.7, 98.6, 99.5, 100.3, 100.9, 101.3, 100.7]) cl.push(v);
  const d = mkBars(cl, rnd, { vBase: 60, wick: 0.55 });
  const s = d[sig]!;
  s.o = lo + 0.35;
  s.c = lo + 1.3;
  s.h = lo + 1.5;
  s.l = lo - 1.7;
  s.v = 132;
  s.vhi = true;
  s.ring = GOLD;
  for (let i = 15; i < sig; i++) d[i]!.v = 58 + rnd() * 22;

  return candleChart({
    width: 760,
    height: 290,
    volHeight: 52,
    title: lang === 'vi' ? 'Cấu trúc mean reversion trong range' : 'Mean-reversion-in-range structure',
    data: d,
    overlays: [{ values: emaOf(cl, 10), color: GOLD, width: 1.7 }],
    levels: [
      { y: hi, color: MUTE, label: lang === 'vi' ? 'BIÊN TRÊN' : 'RANGE TOP', dash: '5 4' },
      { y: lo, color: MUTE, label: lang === 'vi' ? 'BIÊN DƯỚI' : 'RANGE LOW', dash: '5 4' },
      { y: 100.3, color: BLUE, label: tx(L.target, lang), dash: '2 5' },
      { y: s.l, color: DOWN, label: tx(L.stop, lang), dash: '4 4' },
    ],
    notes: [
      {
        i: sig,
        at: 'below',
        arrow: true,
        dy: 6,
        color: GOLD,
        text: lang === 'vi' ? 'RSI < 30 + nến đảo chiều tại hỗ trợ' : 'RSI < 30 + reversal bar at support',
      },
    ],
  });
}

// ── 8. Shorting a rally in a downtrend ──────────────────────────────────────

export function shortRallyChart(lang: Lang): string {
  const rnd = seeded(777);
  const cl: number[] = [];
  let p = 100;
  for (let i = 0; i < 16; i++) {
    p -= 0.85 + (rnd() - 0.5) * 0.6;
    cl.push(p);
  }
  for (let i = 0; i < 8; i++) {
    p += 0.95 + (rnd() - 0.5) * 0.4;
    cl.push(p);
  }
  const sig = cl.length;
  const top = p;
  cl.push(p - 0.5);
  for (let i = 0; i < 10; i++) {
    p -= 1.0 + (rnd() - 0.5) * 0.6;
    cl.push(p - 0.6);
  }
  const d = mkBars(cl, rnd, { vBase: 65, wick: 0.5 });
  const s = d[sig]!;
  s.o = top - 0.2;
  s.c = top - 1.15;
  s.h = top + 1.7;
  s.l = top - 1.45;
  s.v = 150;
  s.vhi = true;
  s.ring = DOWN;

  return candleChart({
    width: 760,
    height: 270,
    volHeight: 48,
    title: lang === 'vi' ? 'Cấu trúc short nhịp hồi' : 'Short-the-rally structure',
    data: d,
    overlays: [{ values: emaOf(cl, 21), color: GOLD, width: 1.7 }],
    levels: [
      { y: s.h, color: DOWN, label: tx(L.stop, lang), dash: '4 4' },
      { y: s.l, color: UP, label: tx(L.sell, lang), dash: '6 3' },
    ],
    notes: [
      {
        i: sig,
        at: 'above',
        arrow: true,
        dy: 6,
        color: DOWN,
        text: lang === 'vi' ? 'Bị từ chối tại 21 EMA' : 'Rejected at the 21 EMA',
      },
    ],
  });
}

// ── 9. Anatomy of the three reversal bars ───────────────────────────────────

const ANATOMY: {
  key: string;
  name: string;
  bars: Candle[];
  note: Bi;
  blurb: Bi;
  priorLow?: number;
}[] = [
  {
    key: 'hammer',
    name: 'HAMMER',
    bars: [
      { o: 104, h: 104.6, l: 102.4, c: 102.8, v: 60 },
      { o: 102.8, h: 103.1, l: 101.2, c: 101.5, v: 52 },
      { o: 101.5, h: 101.8, l: 100.1, c: 100.6, v: 44 },
      { o: 100.5, h: 101.1, l: 96.6, c: 100.9, v: 130, vhi: true, ring: UP },
      { o: 101.2, h: 103.4, l: 101.0, c: 103.1, v: 115, vhi: true },
    ],
    note: { en: 'long lower wick, closes near the high', vi: 'bóng dưới dài, đóng gần đỉnh' },
    blurb: {
      en: 'Lower wick ≥ 2× the body, close near the high. <b>The intraday sell-off was fully absorbed.</b> Reliable — if it sits at support.',
      vi: 'Bóng dưới ≥ 2× thân, đóng cửa gần đỉnh. <b>Bán tháo trong phiên bị hấp thụ hết.</b> Tin cậy cao — nếu ở hỗ trợ.',
    },
  },
  {
    key: 'engulf',
    name: 'BULLISH ENGULFING',
    bars: [
      { o: 104, h: 104.4, l: 102.6, c: 102.9, v: 58 },
      { o: 102.9, h: 103.2, l: 101.3, c: 101.6, v: 50 },
      { o: 101.8, h: 102.0, l: 100.2, c: 100.4, v: 56 },
      { o: 100.0, h: 103.6, l: 99.7, c: 103.4, v: 145, vhi: true, ring: UP },
      { o: 103.5, h: 105.2, l: 103.3, c: 104.9, v: 120, vhi: true },
    ],
    note: { en: 'engulfs the red body', vi: 'bao trọn nến đỏ' },
    blurb: {
      en: "The body swallows yesterday's red body whole. <b>Control changed hands in a single session.</b> Strongest with big volume.",
      vi: 'Thân bao trọn thân nến đỏ hôm trước. <b>Đổi chủ hoàn toàn trong một phiên.</b> Mạnh nhất khi kèm volume lớn.',
    },
  },
  {
    key: 'reversal',
    name: 'REVERSAL BAR',
    bars: [
      { o: 104, h: 104.5, l: 102.8, c: 103.0, v: 58 },
      { o: 103.0, h: 103.3, l: 101.5, c: 101.7, v: 54 },
      { o: 101.7, h: 102.0, l: 100.8, c: 101.0, v: 48 },
      { o: 100.9, h: 102.6, l: 99.2, c: 102.4, v: 138, vhi: true, ring: UP },
      { o: 102.5, h: 104.3, l: 102.3, c: 104.0, v: 112, vhi: true },
    ],
    note: { en: 'breaks the low, then closes strong', vi: 'phá đáy rồi đóng mạnh' },
    blurb: {
      en: 'Lower low than yesterday but closes in the top 25%. <b>A false breakdown — a trap for sellers.</b> Very strong, and few people watch for it.',
      vi: 'Đáy thấp hơn hôm trước nhưng đóng ở top 25%. <b>Phá đáy giả — bẫy người bán.</b> Rất mạnh, ít người để ý.',
    },
    priorLow: 100.8,
  },
];

export function candleAnatomyFigure(lang: Lang): string {
  const cells = ANATOMY.map((a) =>
    cell(
      a.name,
      UP,
      candleChart({
        width: 260,
        height: 185,
        volHeight: 34,
        title: a.name,
        data: a.bars,
        notes: [{ i: 3, at: 'below', dy: 10, color: UP, text: tx(a.note, lang) }],
        levels: a.priorLow
          ? [{ y: a.priorLow, color: MUTE, label: lang === 'vi' ? 'đáy cũ' : 'prior low', dash: '3 3' }]
          : [],
      }),
      tx(a.blurb, lang),
    ),
  ).join('');

  return figure({
    title:
      lang === 'vi'
        ? '🕯️ Hình 4 — Giải phẫu ba mẫu nến đảo chiều tăng'
        : '🕯️ Figure 4 — Anatomy of the three bullish reversal bars',
    caption:
      lang === 'vi'
        ? 'Chú ý cây nến được khoanh: mỗi mẫu đều kể cùng một câu chuyện — giá bị đẩy xuống rồi bị mua lại hết trước khi đóng cửa.'
        : 'Watch the ringed bar: all three tell the same story — price was pushed down and bought back before the close.',
    body: `<div class="swp-grid swp-g3">${cells}</div>`,
  });
}

// ── 10. Same pattern, two R-multiples ───────────────────────────────────────

export function rrFigure(lang: Lang): string {
  function build(wide: boolean) {
    const rnd = seeded(31337);
    const cl: number[] = [];
    let p = 100;
    for (let i = 0; i < 14; i++) {
      p += 0.7 + (rnd() - 0.5) * 0.5;
      cl.push(p);
    }
    for (let i = 0; i < 4; i++) {
      p -= 1.1;
      cl.push(p);
    }
    const lowP = p;
    cl.push(p + 0.8);
    for (let i = 0; i < 6; i++) cl.push(p + 1.5 + i * 1.3);
    const d = mkBars(cl, rnd, { vBase: 55, wick: 0.45 });
    const i = 18;
    const span = wide ? 7.0 : 2.6;
    const s = d[i]!;
    s.o = lowP - 0.1;
    s.c = lowP + 0.75;
    s.h = lowP + 0.95;
    s.l = lowP + 0.95 - span;
    s.v = 120;
    s.vhi = true;
    s.ring = wide ? DOWN : UP;
    return { d, i, entry: s.h, stop: s.l, target: cl[cl.length - 1]! + 1.0 };
  }

  const render = (wide: boolean) => {
    const b = build(wide);
    const R = (b.target - b.entry) / (b.entry - b.stop);
    return candleChart({
      width: 500,
      height: 200,
      showVolume: false,
      data: b.d,
      levels: [
        { y: b.entry, color: UP, label: tx(L.entry, lang), dash: '6 3' },
        { y: b.stop, color: DOWN, label: 'stop', dash: '4 4' },
        { y: b.target, color: BLUE, label: `${R.toFixed(1)}R`, dash: '2 5' },
      ],
      notes: [
        {
          i: b.i,
          at: 'below',
          dy: 12,
          color: wide ? DOWN : UP,
          text: lang === 'vi' ? `biên độ ${wide ? '2,5' : '1,0'}× ATR` : `range ${wide ? '2.5' : '1.0'}× ATR`,
        },
      ],
    });
  };

  return figure({
    title:
      lang === 'vi'
        ? '⚖️ Hình 5 — Cùng một mẫu hình, hai chất lượng khác nhau'
        : '⚖️ Figure 5 — Same pattern, two different qualities',
    caption:
      lang === 'vi'
        ? 'Bên trái: nến gọn, stop gần, cùng mục tiêu đó cho khoảng <b>3R</b>. Bên phải: cùng hammer nhưng biên độ gấp 2,5× ATR — stop quá xa, cùng mục tiêu giá đó giờ chỉ còn khoảng <b>1R</b>. <b>Mẫu hình giống nhau, kết quả kỳ vọng khác hẳn.</b>'
        : 'Left: a tight bar, a close stop, and that same target pays about <b>3R</b>. Right: the same hammer but 2.5× ATR wide — the stop is far away and the identical price target now pays about <b>1R</b>. <b>Same pattern, completely different expectancy.</b>',
    body: `<div class="swp-grid swp-g2">
      ${cell(lang === 'vi' ? '✓ NẾN GỌN · stop hẹp' : '✓ TIGHT BAR · narrow stop', UP, render(false))}
      ${cell(lang === 'vi' ? '✗ NẾN QUÁ RỘNG · stop xa' : '✗ TOO-WIDE BAR · distant stop', DOWN, render(true))}
    </div>`,
  });
}

// ── 11. Four volume situations ──────────────────────────────────────────────

export function volumeCasesFigure(lang: Lang): string {
  // ① pullback, volume drying up — the good case
  const r1 = seeded(11);
  let cl: number[] = [];
  let p = 100;
  for (let i = 0; i < 10; i++) {
    p += 0.9;
    cl.push(p);
  }
  for (let i = 0; i < 6; i++) {
    p -= 0.85;
    cl.push(p);
  }
  for (let i = 0; i < 5; i++) {
    p += 0.95;
    cl.push(p);
  }
  let d = mkBars(cl, r1, { vBase: 70, wick: 0.45 });
  for (let i = 0; i < 10; i++) d[i]!.v = 85 + r1() * 25;
  for (let i = 10; i < 16; i++) {
    d[i]!.v = 40 - (i - 10) * 4.5;
    d[i]!.vlo = true;
  }
  for (let i = 16; i < 21; i++) {
    d[i]!.v = 95 + r1() * 35;
    d[i]!.vhi = true;
  }
  const dryup = candleChart({
    width: 400,
    height: 180,
    volHeight: 52,
    data: d,
    zones: [
      {
        from: 10,
        to: 15,
        fill: `color-mix(in srgb, ${UP} 9%, transparent)`,
        label: lang === 'vi' ? 'VOL CẠN DẦN' : 'VOL DRYING UP',
        color: UP,
      },
    ],
  });

  // ① distribution — the same shape, the opposite meaning
  const r2 = seeded(12);
  cl = [];
  p = 100;
  for (let i = 0; i < 10; i++) {
    p += 0.9;
    cl.push(p);
  }
  for (let i = 0; i < 6; i++) {
    p -= 1.05;
    cl.push(p);
  }
  for (let i = 0; i < 5; i++) {
    p -= 0.8;
    cl.push(p);
  }
  d = mkBars(cl, r2, { vBase: 70, wick: 0.45 });
  for (let i = 0; i < 10; i++) d[i]!.v = 80 + r2() * 20;
  for (let i = 10; i < 16; i++) {
    d[i]!.v = 95 + (i - 10) * 14;
    d[i]!.vhi = true;
  }
  for (let i = 16; i < 21; i++) {
    d[i]!.v = 120 + r2() * 30;
    d[i]!.vhi = true;
  }
  const distrib = candleChart({
    width: 400,
    height: 180,
    volHeight: 52,
    data: d,
    zones: [
      {
        from: 10,
        to: 15,
        fill: `color-mix(in srgb, ${DOWN} 10%, transparent)`,
        label: lang === 'vi' ? 'VOL TĂNG KHI GIẢM' : 'VOL RISING INTO WEAKNESS',
        color: DOWN,
      },
    ],
  });

  // ② reversal bar, volume expanding
  const r3 = seeded(13);
  cl = [];
  p = 100;
  for (let i = 0; i < 7; i++) {
    p += 0.7;
    cl.push(p);
  }
  for (let i = 0; i < 5; i++) {
    p -= 1.0;
    cl.push(p);
  }
  const lp = p;
  cl.push(p + 0.7);
  for (let i = 0; i < 6; i++) cl.push(p + 1.4 + i * 1.1);
  d = mkBars(cl, r3, { vBase: 65, wick: 0.5 });
  const sg = d[12]!;
  sg.o = lp - 0.1;
  sg.c = lp + 0.75;
  sg.h = lp + 0.95;
  sg.l = lp - 2.3;
  for (let i = 7; i < 12; i++) {
    d[i]!.v = 38;
    d[i]!.vlo = true;
  }
  sg.v = 165;
  sg.vhi = true;
  sg.ring = UP;
  for (let i = 13; i < 19; i++) {
    d[i]!.v = 105 + r3() * 30;
    d[i]!.vhi = true;
  }
  const reversal = candleChart({
    width: 400,
    height: 180,
    volHeight: 52,
    data: d,
    notes: [{ i: 12, at: 'below', arrow: true, dy: 6, color: UP, text: lang === 'vi' ? 'vol 2,5×' : 'vol 2.5×' }],
  });

  // ③ breakout, volume erupting
  const r4 = seeded(14);
  cl = [];
  const rz = 102;
  for (let i = 0; i < 14; i++) cl.push(rz - 1.3 + Math.sin(i / 1.8) * 1.1 + (r4() - 0.5) * 0.3);
  for (let i = 0; i < 6; i++) cl.push(rz + 1.0 + i * 1.25);
  d = mkBars(cl, r4, { vBase: 60, wick: 0.4 });
  for (let i = 0; i < 14; i++) {
    d[i]!.v = 36 - i * 1.2;
    d[i]!.vlo = true;
  }
  d[14]!.v = 185;
  d[14]!.vhi = true;
  d[14]!.ring = GOLD;
  for (let i = 15; i < 20; i++) {
    d[i]!.v = 120 + r4() * 25;
    d[i]!.vhi = true;
  }
  const breakout = candleChart({
    width: 400,
    height: 180,
    volHeight: 52,
    data: d,
    levels: [{ y: rz, color: GOLD, label: lang === 'vi' ? 'kháng cự' : 'resistance', dash: '5 4' }],
    notes: [{ i: 14, at: 'below', arrow: true, dy: 6, color: GOLD, text: 'vol 3×' }],
  });

  return figure({
    title:
      lang === 'vi'
        ? '📊 Hình 6 — Bốn tình huống volume và ý nghĩa ngược nhau của chúng'
        : '📊 Figure 6 — Four volume situations, and their opposite meanings',
    caption:
      lang === 'vi'
        ? 'Điểm quan trọng: <b>volume cạn có thể là tốt hoặc xấu tùy setup</b>. Không có luật chung "volume cao là tốt".'
        : 'The point: <b>drying volume can be good or bad depending on the setup</b>. There is no blanket "high volume is good" rule.',
    body: `<div class="swp-grid swp-g2">
      ${cell(lang === 'vi' ? '① PULLBACK — volume phải CẠN ✓' : '① PULLBACK — volume must DRY UP ✓', UP, dryup)}
      ${cell(
        lang === 'vi' ? '① PHÂN PHỐI — volume tăng khi giảm ✗' : '① DISTRIBUTION — volume rises as price falls ✗',
        DOWN,
        distrib,
      )}
      ${cell(
        lang === 'vi' ? '② NẾN ĐẢO CHIỀU — volume phải NỞ ✓' : '② REVERSAL BAR — volume must EXPAND ✓',
        UP,
        reversal,
      )}
      ${cell(lang === 'vi' ? '③ BREAKOUT — volume phải BÙNG ✓' : '③ BREAKOUT — volume must ERUPT ✓', GOLD, breakout)}
    </div>`,
  });
}
