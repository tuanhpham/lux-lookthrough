/**
 * A trade plan as a standalone, printable HTML document.
 *
 * ── WHY A PLAN IS WORTH PRINTING ────────────────────────────────────────────
 * The user asked for this "similar to case study for the trade plan", and the two are the
 * same document at different times: the case study is what the trade turned out to be, the
 * plan is what it was supposed to be. Having the second one on paper before the trade is
 * what makes the first one honest afterwards — you cannot revise a plan you printed.
 *
 * So the report leads with the things that are embarrassing to get wrong in hindsight: the
 * grade and where it came from, every criterion with its tick or cross, the exact levels, and
 * whether the plan was actually acknowledged before the buy. The note goes in whole.
 *
 * Self-contained by construction — inline styles, an inline SVG chart, one `window.print()`
 * button, no external assets — so it opens and prints years later, offline, in any browser.
 * `downloadHtml` writes the file; the file's own button is the "save as PDF" half.
 *
 * `planReportHtml` is a pure function of its input so it can be tested without a DOM, which
 * is the only way anything in this app's vitest can be tested.
 */
import {
  gradeByGroup,
  type Bar, type ConvictionRating, type GradeResult, type SetupKey,
} from '@screener/core';
import { caseSvgChart, type ChartSubject } from '../caseStudies/svgChart.js';
import { criterionLabel, groupLabel } from './gradeWords.js';
import { setupName } from './planWords.js';
import { criterionSource } from './gradeView.js';
import { sanitizeNoteHtml, isNoteEmpty } from '../ui/richNote.js';
import { downloadHtml } from '../ui/exportFile.js';
import type { PlanLevels, SymbolPlan } from './planStore.js';

export interface PlanReportInput {
  plan: SymbolPlan;
  /** The scored checklist, or null when the trade was never graded. */
  grade: GradeResult | null;
  /** The letter in force: the override, else the score's. */
  effective: ConvictionRating | null;
  /** The levels as they stand on the form — which may be the user's own, not the book's. */
  levels: PlanLevels;
  shares: number;
  currency: 'EUR' | 'USD';
  /**
   * 1 EUR = N USD on `date` — needed ONLY to draw euro levels on a chart of dollar closes.
   *
   * Passed in rather than read from `fx.ts` so this module stays a pure function of its input
   * (see the header). Omitted, or with `currency: 'USD'`, nothing is converted; omitted WITH
   * euro levels the chart is dropped rather than drawn with the lines off the axis.
   */
  fxRate?: number;
  /** The intended trade date, which is also what the chart is centred on. */
  date: string;
  /** Daily bars for the chart. An empty array simply omits it. */
  bars: readonly Bar[];
  /** Share of full size the effective letter allows, from the ladder. */
  pctOfFull: number;
  vi: boolean;
  /**
   * How the trade ended, when it has — the case-study half of the same document.
   *
   * Optional, and absent is the normal case: a plan printed BEFORE the trade has no outcome, and
   * inventing an "Open" verdict for it would put a result on a document whose whole purpose is
   * to be unrevisable. Present, the report grows an outcome pill, an exit block and the exit
   * level on the chart, so one file carries both halves — what was supposed to happen, and what
   * did. `price` is in `currency`, like the levels.
   */
  exit?: {
    date: string | null;
    price: number | null;
    /** One line: the reason from the list, the user's words, or both. Plain text. */
    reason: string;
    outcome: 'win' | 'loss' | 'open' | 'scratch';
    rMultiple: number | null;
    pctGain: number | null;
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const GRADE_HEX: Record<string, string> = { A: '#18d89a', B: '#5b8cff', C: '#ffb648', D: '#ff5266' };

/**
 * The note, re-sanitised on the way into the file.
 *
 * The stored note has already been through `sanitizeNoteHtml` on every write path, so this is
 * defence in depth — but it is the kind worth having, because a plan can arrive from the sync
 * having been written by another device on an older version of this code, and what we are
 * building here is a file the user will later open directly in a browser.
 *
 * `sanitizeNoteHtml` needs a real `DOMParser`; hand-rolling a regex substitute would be a
 * genuinely worse sanitiser, so with no DOM we do not try to clean the markup — we escape it
 * whole and print the note as literal text. That loses the formatting and only ever happens
 * outside a browser (which in practice means this suite), but it can never emit markup we
 * failed to inspect.
 */
function safeNote(html: string): string {
  return typeof DOMParser === 'undefined' ? esc(html) : sanitizeNoteHtml(html);
}

/** Bars either side of the trade date, so the chart shows the base and not just the pivot. */
function planWindow(bars: readonly Bar[], date: string): Bar[] {
  const start = new Date(date + 'T00:00:00');
  start.setMonth(start.getMonth() - 8);
  const lo = start.toISOString().slice(0, 10);
  return bars.filter((b) => b.date >= lo);
}

/**
 * The print half of the stylesheet — kept out of the template so it can be explained.
 *
 * ── WHY THE PRINTED PAGE LOST ITS COLOURS ───────────────────────────────────
 * The user's "khi ma print to PDF, toi thay khong giu duoc cai background color dep nhu o
 * html". Two separate things were throwing them away, and fixing only one would have changed
 * nothing:
 *
 *   1. Browsers drop background colours and images when printing, to save ink.
 *      `print-color-adjust: exact` is the only way to ask for them back, and it has to sit on
 *      the printed root. Chrome and Safari still want the `-webkit-` spelling, so both are
 *      written; there is no way to feature-detect this from inside a static file.
 *   2. This stylesheet USED TO ask for white itself — `@media print { body { background:#fff;
 *      color:#000 } }`. That rule wins over any amount of colour-adjust, so the real fix was
 *      deleting it. On white the muted greys (#5c6575 on #fff) came out almost invisible while
 *      the grade pill, the ✓/✗ marks and the chart's inline colours stayed dark-theme — a
 *      document that looked broken rather than thrifty.
 *
 * Ink is still a real cost, so the choice moves to the reader instead of to this file: one
 * checkbox that restores the white document. It is done with `:has()` and NO script, because
 * the on-screen viewer renders this same HTML in an iframe sandboxed without scripts (see
 * `openPlanReport`) — a toggle that only worked in the downloaded copy would be a dead control
 * on the very screen where the user first meets it. `display:none` on the toolbar does not
 * stop `#ink:checked` matching, so the box keeps its state while being hidden from the page.
 */
const PRINT_CSS = `  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { margin: 12mm; }
  @media print {
    body { padding:0; max-width:none; }
    .toolbar { display:none; }
    /* Never split a chart, a stat, the note or a criterion row across a page break. */
    .chart,.stat,.notes,.ack,.gbar,tr { break-inside:avoid; }
    /* Opt in, per print: the old white document, for when ink matters more. */
    body:has(#ink:checked) { background:#fff; color:#000; }
    body:has(#ink:checked) .chart,
    body:has(#ink:checked) .stat,
    body:has(#ink:checked) .notes { background:#fafafa; border-color:#ddd; }
    body:has(#ink:checked) .muted { color:#555; }
  }`;

/** The full standalone document. */
export function planReportHtml(i: PlanReportInput): string {
  const { plan, grade, levels, vi } = i;
  const cur = i.currency === 'EUR' ? '€' : '$';
  const money = (v: number | null): string =>
    v == null ? '—' : cur + (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));

  const riskPerShare = levels.entry != null && levels.stop != null && levels.stop < levels.entry
    ? levels.entry - levels.stop : null;
  const rr = riskPerShare != null && levels.target != null && levels.entry != null && levels.target > levels.entry
    ? (levels.target - levels.entry) / riskPerShare : null;
  const positionValue = levels.entry != null && i.shares > 0 ? levels.entry * i.shares : null;
  const riskAmount = riskPerShare != null && i.shares > 0 ? riskPerShare * i.shares : null;

  const L = vi
    ? {
      plan: 'Kế hoạch giao dịch', setup: 'Thiết lập', date: 'Ngày dự kiến',
      entry: 'Giá vào', stop: 'Cắt lỗ', target: 'Mục tiêu', shares: 'Số cổ',
      posval: 'Giá trị vị thế', risk: 'Rủi ro', riskps: 'Rủi ro/cổ', rr: 'Lợi nhuận:Rủi ro',
      grade: 'Hạng', score: 'Điểm', size: 'Cỡ vị thế cho phép',
      crit: 'Bảng tiêu chí', note: 'Ghi chú kế hoạch', nonote: 'Chưa có ghi chú.',
      ack: 'Đã xem kế hoạch', noack: 'CHƯA xác nhận đã xem kế hoạch',
      ungraded: 'Kế hoạch này chưa được chấm điểm — không có thiết lập nào được chọn, hoặc dữ liệu giá quá ngắn.',
      overridden: 'Người dùng ghi đè hạng (điểm cho {auto})',
      auto: 'Đo tự động', manual: 'Tự trả lời', weight: 'Trọng số', who: 'Theo',
      print: '🖨 In / Lưu PDF',
      ink: 'In trên giấy trắng (tiết kiệm mực)',
      exit: 'Kết thúc giao dịch', exitdate: 'Ngày thoát', exitpx: 'Giá thoát',
      resultr: 'Kết quả R', pctgain: 'Lãi/lỗ %', held: 'Số ngày giữ', why: 'Lý do thoát',
      nowhy: 'Chưa ghi lý do.',
      out: { win: 'Thắng', loss: 'Thua', open: 'Đang mở', scratch: 'Hòa' } as Record<string, string>,
      foot: 'Tạo lúc {when} · The Professional — kế hoạch giao dịch · Chỉ dùng để học. Không phải lời khuyên đầu tư.',
      staleack: 'Xác nhận lúc {when}, với giá vào {entry} / cắt lỗ {stop}.',
    }
    : {
      plan: 'Trade plan', setup: 'Setup', date: 'Intended date',
      entry: 'Entry', stop: 'Stop', target: 'Target', shares: 'Shares',
      posval: 'Position value', risk: 'Risk', riskps: 'Risk/share', rr: 'Reward:Risk',
      grade: 'Grade', score: 'Score', size: 'Size allowed',
      crit: 'Scorecard', note: 'Plan note', nonote: 'No note yet.',
      ack: 'Plan acknowledged', noack: 'NOT acknowledged — the plan was never confirmed as read',
      ungraded: 'This plan was never graded — no setup was chosen, or the price history was too short.',
      overridden: 'Grade overridden by hand (the score said {auto})',
      auto: 'Measured', manual: 'Answered by hand', weight: 'Weight', who: 'Per',
      print: '🖨 Print / Save as PDF',
      ink: 'Print on white paper (save ink)',
      exit: 'How it ended', exitdate: 'Exit date', exitpx: 'Exit price',
      resultr: 'Result R', pctgain: 'Gain/loss %', held: 'Days held', why: 'Why it was closed',
      nowhy: 'No reason recorded.',
      out: { win: 'Win', loss: 'Loss', open: 'Open', scratch: 'Scratch' } as Record<string, string>,
      foot: 'Generated {when} · The Professional — trade plan · Educational use only. Not financial advice.',
      staleack: 'Acknowledged {when}, against entry {entry} / stop {stop}.',
    };

  const gradeHex = i.effective ? (GRADE_HEX[i.effective] ?? '#99a2b2') : '#5c6575';
  const overridden = plan.gradeOverride !== null && grade !== null && plan.gradeOverride !== grade.grade;

  const stat = (k: string, v: string, color?: string): string =>
    `<div class="stat"><div class="k">${esc(k)}</div><div class="v"${color ? ` style="color:${color}"` : ''}>${v}</div></div>`;

  // The chart, drawn at the levels the plan is actually placing — the same renderer the case
  // studies use, so the exported plan and the exported post-mortem look like one document.
  //
  // The LEVELS go back to dollars first. The bars are raw closes and the boxes may have been
  // filled in euros (which is the common case for this user), and a €198 line on a $232 chart
  // is not a wrong label, it is a line off the bottom of the axis. The money elsewhere in the
  // document stays in `i.currency`: that is the currency the trade is being placed in.
  const fx = i.currency === 'EUR' && i.fxRate && i.fxRate > 0 ? i.fxRate : 0;
  const chartPx = (v: number | null): number | null => (v === null ? v : fx > 0 ? v * fx : v);
  const subject: ChartSubject = {
    entry: chartPx(levels.entry),
    stop: chartPx(levels.stop),
    target: chartPx(levels.target),
    // The renderer already draws an ✕ at the exit and a line at its price — it was built for the
    // case studies, which is what a plan with an exit on it has become.
    exitPrice: chartPx(i.exit?.price ?? null),
    keyDate: i.date,
    exitDate: i.exit?.date ?? null,
    outcome: i.exit?.outcome ?? 'open',
    catalysts: [],
  };
  const win = planWindow(i.bars, i.date);
  // No rate for euro levels means the lines cannot be placed against these candles at all.
  // A chart with the lines in the wrong place is worse than no chart, because it is the part
  // of this document a reader trusts without reading.
  const plottable = i.currency !== 'EUR' || fx > 0;
  const chart = win.length >= 5 && plottable
    ? `<div class="chart">${caseSvgChart(win, subject, { width: 980, height: 420 })}</div>`
    : '';

  const bars = grade
    ? gradeByGroup(grade).filter((g) => g.possible > 0).map((g) => {
      const share = (g.earned / g.possible) * 100;
      const col = share >= 80 ? '#18d89a' : share >= 50 ? '#ffb648' : '#ff5266';
      return `<div class="gbar"><span class="gbar-k">${esc(groupLabel(g.group, vi))}</span>
        <span class="gbar-track"><span class="gbar-fill" style="width:${share.toFixed(0)}%;background:${col}"></span></span>
        <span class="gbar-n">${g.earned}/${g.possible}</span></div>`;
    }).join('')
    : '';

  // Unasked automatic criteria are dropped, for the same reason the on-screen panel drops
  // them: a plan printed with five greyed-out gap questions under a VCP teaches the reader
  // that the checklist is mostly blanks.
  const critRows = grade
    ? grade.outcomes.filter((c) => c.known || c.source !== 'auto').map((c) => {
      const mark = !c.known ? '<span class="mk muted">–</span>'
        : c.met ? '<span class="mk" style="color:#18d89a">✓</span>'
          : '<span class="mk" style="color:#ff5266">✗</span>';
      return `<tr>
        <td>${mark}</td>
        <td>${esc(criterionLabel(c.key, vi))}</td>
        <td class="mono">${c.weight}</td>
        <td class="mono muted">${esc(c.measured ?? (c.source === 'auto' ? '' : L.manual))}</td>
        <td class="muted small">${esc(groupLabel(c.group, vi))}</td>
        <td class="muted small">${esc(criterionSource(c.key))}</td>
      </tr>`;
    }).join('')
    : '';

  const ackLine = plan.reviewedAt && plan.levels
    ? `<div class="ack ok">✓ ${esc(L.ack)} — ${esc(
      L.staleack
        .replace('{when}', plan.reviewedAt.slice(0, 16).replace('T', ' '))
        .replace('{entry}', money(plan.levels.entry))
        .replace('{stop}', money(plan.levels.stop)),
    )}</div>`
    : `<div class="ack bad">⚠ ${esc(L.noack)}</div>`;

  /*
   * The outcome block — only when there is one.
   *
   * It sits BELOW the scorecard on purpose. Read top to bottom the document is then the trade in
   * the order it happened: the grade that decided the size, the levels, the criteria, and only
   * then how it ended. Putting the result at the top would make every re-read of the plan an
   * exercise in hindsight, which is the one thing a printed plan is supposed to protect against.
   */
  const OUT_HEX: Record<string, string> = { win: '#18d89a', loss: '#ff5266', open: '#5b8cff', scratch: '#99a2b2' };
  const x = i.exit;
  const held = x?.date && i.date
    ? Math.round((new Date(x.date + 'T00:00:00').getTime() - new Date(i.date + 'T00:00:00').getTime()) / 864e5)
    : null;
  const outHex = x ? (OUT_HEX[x.outcome] ?? '#99a2b2') : '#99a2b2';
  const exitBlock = x
    ? `<h2>${esc(L.exit)}</h2>
  <div class="grid">
    ${stat(L.exitdate, x.date ? esc(x.date) : '—')}
    ${stat(L.exitpx, money(x.price), '#e879f9')}
    ${stat(L.resultr, x.rMultiple != null ? x.rMultiple.toFixed(2) + 'R' : '—',
      x.rMultiple != null ? (x.rMultiple >= 0 ? '#18d89a' : '#ff5266') : undefined)}
    ${stat(L.pctgain, x.pctGain != null ? (x.pctGain > 0 ? '+' : '') + x.pctGain.toFixed(2) + '%' : '—',
      x.pctGain != null ? (x.pctGain >= 0 ? '#18d89a' : '#ff5266') : undefined)}
    ${stat(L.held, held != null ? String(held) : '—')}
  </div>
  <h2>${esc(L.why)}</h2>
  <div class="notes">${x.reason ? esc(x.reason) : `<span class="muted">${esc(L.nowhy)}</span>`}</div>`
    : '';

  const noteHtml = !isNoteEmpty(plan.note)
    ? safeNote(plan.note)
    : `<span class="muted">${esc(L.nonote)}</span>`;

  const setupWord = plan.setup ? setupName(plan.setup as SetupKey, vi) : '—';

  return `<!doctype html>
<html lang="${vi ? 'vi' : 'en'}"><head><meta charset="utf-8"><title>${esc(plan.symbol)} — ${esc(L.plan)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { background:#07080b; color:#e9edf4; font:14px/1.6 'Hanken Grotesk',system-ui,sans-serif; margin:0; padding:32px; max-width:1040px; }
  h1 { font-size:24px; letter-spacing:-.03em; margin:0 0 2px; }
  .sub { color:#99a2b2; margin:0 0 4px; font-size:14px; }
  .pill { display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:3px 10px; border-radius:999px; border:1px solid; }
  .toolbar { margin:16px 0; }
  button { background:#18d89a; color:#04130d; border:0; border-radius:8px; padding:9px 16px; font-weight:700; font-size:13px; cursor:pointer; }
  .chart { background:#0c0e13; border:1px solid #1d222c; border-radius:12px; padding:10px; margin:16px 0; }
  .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:16px 0; }
  .stat { background:#0c0e13; border:1px solid #1d222c; border-radius:10px; padding:10px 12px; }
  .stat .k { color:#5c6575; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
  .stat .v { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:16px; margin-top:3px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:#18d89a; margin:24px 0 8px; }
  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:6px 10px; border-bottom:1px solid #1d222c; font-size:13px; vertical-align:top; }
  .mono { font-family:'JetBrains Mono',ui-monospace,monospace; }
  .small { font-size:11px; }
  .mk { font-weight:700; }
  .gbar { display:flex; align-items:center; gap:10px; margin:4px 0; }
  .gbar-k { width:200px; font-size:12px; color:#99a2b2; }
  .gbar-track { flex:1; height:7px; background:#1d222c; border-radius:999px; overflow:hidden; }
  .gbar-fill { display:block; height:100%; }
  .gbar-n { width:60px; text-align:right; font-family:'JetBrains Mono',monospace; font-size:11px; color:#99a2b2; }
  .notes { background:#0c0e13; border:1px solid #1d222c; border-radius:10px; padding:14px 16px; line-height:1.7; }
  .ack { border-radius:10px; padding:10px 14px; margin:16px 0; font-size:13px; border:1px solid; }
  .ack.ok { color:#18d89a; border-color:#18d89a44; background:#0d1a14; }
  .ack.bad { color:#ffb648; border-color:#ffb64844; background:#1a1509; }
  .muted { color:#5c6575; }
  .foot { color:#5c6575; font-size:11px; margin-top:28px; border-top:1px solid #1d222c; padding-top:12px; }
  .ink { color:#5c6575; font-size:12px; margin-left:12px; cursor:pointer; user-select:none; }

${PRINT_CSS}
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">${esc(L.print)}</button><label class="ink"><input type="checkbox" id="ink"> ${esc(L.ink)}</label></div>

  <h1>${esc(plan.symbol)}
    <span class="pill" style="color:${gradeHex};border-color:${gradeHex}">${esc(L.grade)} ${esc(i.effective ?? '—')}</span>
    ${x ? `<span class="pill" style="color:${outHex};border-color:${outHex}">${esc(L.out[x.outcome] ?? x.outcome)}</span>` : ''}
    ${overridden ? `<span class="pill" style="color:#ffb648;border-color:#ffb648">${esc(L.overridden.replace('{auto}', grade?.grade ?? '—'))}</span>` : ''}
  </h1>
  <p class="sub">${esc(L.plan)} · ${esc(L.setup)} <b>${esc(setupWord)}</b> · ${esc(L.date)} <b>${esc(i.date)}</b></p>
  ${grade
    ? `<p class="sub">${esc(L.score)} <b>${grade.score.toFixed(0)}</b>/100 · ${esc(L.size)} <b>${i.pctOfFull}%</b></p>`
    : `<p class="sub" style="color:#ffb648">${esc(L.ungraded)}</p>`}

  ${ackLine}
  ${chart}

  <div class="grid">
    ${stat(L.entry, money(levels.entry), '#5b8cff')}
    ${stat(L.stop, money(levels.stop), '#ff5266')}
    ${stat(L.target, money(levels.target), '#18d89a')}
    ${stat(L.rr, rr != null ? rr.toFixed(2) + ':1' : '—')}
    ${stat(L.shares, i.shares > 0 ? String(i.shares) : '—')}
    ${stat(L.posval, money(positionValue))}
    ${stat(L.riskps, money(riskPerShare), '#ffb648')}
    ${stat(L.risk, money(riskAmount), '#ffb648')}
  </div>

  ${grade ? `<h2>${esc(L.crit)}</h2>${bars}
  <table><thead><tr>
    <th></th><th>${esc(L.crit)}</th><th>${esc(L.weight)}</th><th>${esc(L.auto)}</th><th></th><th>${esc(L.who)}</th>
  </tr></thead><tbody>${critRows}</tbody></table>` : ''}

  ${exitBlock}

  <h2>${esc(L.note)}</h2>
  <div class="notes">${noteHtml}</div>

  <p class="foot">${esc(L.foot.replace('{when}', plan.updatedAt.slice(0, 16).replace('T', ' ')))}</p>
</body></html>`;
}

/** Build the report and hand it to the browser as a file. */
export function printPlanReport(i: PlanReportInput): void {
  downloadHtml(planReportHtml(i), `trade-plan-${i.plan.symbol || 'plan'}-${i.date}`);
}

/**
 * The same report, on screen — for "show me the plan this trade was made from".
 *
 * ── WHY AN IFRAME AND NOT A SECOND LAYOUT ───────────────────────────────────
 * Rendering the plan again in the app's own styles would be a second version of this document,
 * and the two would drift: a criterion added here, a level renamed there, and the plan the
 * user reads on screen would stop being the plan they printed. `srcdoc` puts the actual file
 * in front of them, so there is exactly one layout and looking is the same as printing.
 *
 * Sandboxed without `allow-scripts`, which disables the document's own print button — hence
 * the dialog's own. A stored snapshot is the oldest data in the app and may have been written
 * by a version of this code that is no longer here; it is rendered as a document, so it is
 * given no way to run anything.
 */
export function openPlanReport(i: PlanReportInput, opts: { title: string; print: string; close: string }): void {
  const host = document.createElement('div');
  host.className = 'dialog-host';
  host.innerHTML = `
    <div class="dialog-backdrop"></div>
    <div class="dialog" style="width:min(1100px,96vw)">
      <div class="dialog-title">${esc(opts.title)}</div>
      <div class="dialog-body" style="padding:0">
        <iframe sandbox style="width:100%;height:68vh;border:1px solid var(--border);border-radius:8px;background:#07080b"></iframe>
      </div>
      <div class="dialog-actions">
        <button class="btn-outline" data-act="close">${esc(opts.close)}</button>
        <button class="btn" data-act="print">⎙ ${esc(opts.print)}</button>
      </div>
    </div>`;
  document.body.appendChild(host);
  // `srcdoc` after insertion: assigning it while the iframe is detached loads the document
  // twice in WebKit, and this one carries an inline SVG chart.
  host.querySelector('iframe')!.srcdoc = planReportHtml(i);
  const close = (): void => host.remove();
  host.querySelector('[data-act="close"]')!.addEventListener('click', close);
  host.querySelector('.dialog-backdrop')!.addEventListener('click', close);
  host.querySelector('[data-act="print"]')!.addEventListener('click', () => printPlanReport(i));
}
