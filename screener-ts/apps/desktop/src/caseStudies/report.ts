/**
 * Self-contained HTML report for a case study: the embedded SVG chart, the
 * setup metadata, a catalyst timeline and the notes — styled like the app's
 * report serializer. Includes a Print button so the user can "Save as PDF" from
 * the browser. No external assets, so the file opens/prints fine offline.
 */
import type { Bar } from '@screener/core';
import type { CaseStudy } from './store.js';
import { caseSvgChart, windowBars } from './svgChart.js';
import { inCurrency } from '../portfolio/planExit.js';
// `safeNoteHtml`, not `sanitizeNoteHtml`: this document is also built where there is no
// `DOMParser` to sanitise with. See its comment in `ui/richNote.ts`.
import { safeNoteHtml, isNoteEmpty } from '../ui/richNote.js';
import {
  scorecardBarsHtml, scorecardTableHtml, scorecardWords, SCORECARD_CSS,
} from '../portfolio/scorecard.js';
import { setupName } from '../portfolio/planWords.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A price in a given currency. The study says which; a study with no `currency` is in dollars. */
const moneyIn = (sym: string) => (v: number | null | undefined): string =>
  (v == null ? '—' : sym + (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)));

const OUTCOME_LABEL: Record<CaseStudy['outcome'], string> = {
  win: 'Win',
  loss: 'Loss',
  open: 'Open',
  scratch: 'Scratch',
};
const OUTCOME_COLOR: Record<CaseStudy['outcome'], string> = {
  win: '#18d89a',
  loss: '#ff5266',
  open: '#5b8cff',
  scratch: '#99a2b2',
};
const RATING_COLOR: Record<string, string> = { A: '#18d89a', B: '#5b8cff', C: '#ffb648', D: '#ff5266' };

/**
 * The print half of the stylesheet, and why it is not simply `background:#fff`.
 *
 * This document used to force white on print, which is what threw away the colours the user
 * asked to keep ("khi ma print to PDF, toi thay khong giu duoc cai background color dep nhu o
 * html"). Browsers also drop backgrounds on their own to save ink, so BOTH had to go: the rule
 * is deleted and `print-color-adjust: exact` asks for the colours back. Ink is still a real
 * cost, so the white document survives as a checkbox the reader ticks — done with `:has()` and
 * no script, matching `portfolio/planReport.ts`, which explains the reasoning in full.
 *
 * The checkbox flips `<html>` as well as `<body>`, because the page MARGINS are painted by the
 * canvas and the canvas takes its colour from the root — `<body>`'s background only propagates
 * there while the root has none of its own, and `:root { color-scheme: dark }` gives it one.
 * Without the root rule the reader gets a white page inside a black 12mm frame, which is exactly
 * what the user saw: "dang sau do o 4 margins co mau den trong rat ky".
 */
const PRINT_CSS = `  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { margin: 12mm; }
  @media print {
    body { padding:0; max-width:none; }
    .toolbar { display:none; }
    .chart,.stat,.notes,.why,.ack,.gbar,tr { break-inside:avoid; }
    /* The root as well as the body — otherwise the 12mm page margins print black around a white
       document. Why, in full, in the block comment above this string. */
    html:has(#ink:checked) { background:#fff; color-scheme: light; }
    body:has(#ink:checked) { background:#fff; color:#000; }
    body:has(#ink:checked) .chart,
    body:has(#ink:checked) .stat,
    body:has(#ink:checked) .why,
    body:has(#ink:checked) .ack,
    body:has(#ink:checked) .notes { background:#fafafa; border-color:#ddd; }
    body:has(#ink:checked) .muted { color:#555; }
  }`;

/**
 * Phone and narrow-iframe layout — the twin of the block in `portfolio/planReport.ts`, kept
 * beside this file's own PRINT_CSS for the same reason that one is duplicated: each report is a
 * standalone document that must stand up with no stylesheet but its own. A media query is the
 * right tool here (and the wrong one in `styles.css`) because this document's viewport IS its
 * container: the phone screen, or the `srcdoc` iframe it is previewed in.
 */
const NARROW_CSS = `  @media (max-width: 760px) {
    .grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    h1 { font-size:20px; }
    .stat .v { font-size:15px; }
    th,td { padding:6px; }
    .cat-date { width:auto; }
  }
  @media (max-width: 430px) {
    .grid { grid-template-columns:minmax(0,1fr); }
  }`;

/**
 * Render the full standalone HTML document for a case study.
 *
 * `earnings` are report dates for the chart's E flags — passed in rather than looked up, so this
 * stays a pure function of its input and can be rendered with no network. They are deliberately
 * NOT merged into `study.catalysts`: see `ChartSubject.earnings`.
 *
 * `fxRate` is 1 EUR = N USD on the key date, and is needed ONLY for a study whose levels are in
 * euros: `bars` are always dollars, so the CANDLES are divided to meet the levels rather than the
 * levels multiplied to meet the candles — one rate for the whole window, so no currency move is
 * smuggled into the price action. Same argument, same direction, as `portfolio/planReport.ts`.
 * Missing it on a euro study drops the chart instead of drawing the lines off the axis.
 */
export function caseStudyHtml(
  study: CaseStudy,
  bars: readonly Bar[],
  earnings: readonly string[] = [],
  fxRate = 0,
): string {
  const eur = study.currency === 'EUR';
  const money = moneyIn(eur ? '€' : '$');
  const fx = eur && fxRate > 0 ? fxRate : 0;
  const plottable = !eur || fx > 0;
  const win = inCurrency(windowBars(bars, study.keyDate, study.windowMonths), fx);
  const svg = plottable
    ? caseSvgChart(win, { ...study, earnings }, { width: 980, height: 420 })
    : '<p class="sub" style="color:#ffb648">Chart not drawn: this study’s prices are in euros and '
      + 'no EUR/USD rate for the key date was available, so the levels could not be placed on the '
      + 'dollar candles.</p>';
  const earnInWin = plottable && earnings.some(
    (d) => win.length > 0 && d >= win[0]!.date && d <= win[win.length - 1]!.date,
  );
  const earnNote = earnInWin
    ? '<div class="chart-note" style="color:#a855f7">E = earnings report date (source: Nasdaq, last 4 quarters)</div>'
    : '';

  const stat = (k: string, v: string, color?: string): string =>
    `<div class="stat"><div class="k">${esc(k)}</div><div class="v"${color ? ` style="color:${color}"` : ''}>${v}</div></div>`;

  const rr =
    study.entry != null && study.stop != null && study.target != null && study.entry !== study.stop
      ? ((study.target - study.entry) / (study.entry - study.stop)).toFixed(1) + 'R'
      : '—';

  const catalystRows = study.catalysts.length
    ? study.catalysts
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((c) => `<tr><td class="cat-date">${esc(c.date)}</td><td>${safeNoteHtml(c.text)}</td></tr>`)
        .join('')
    : `<tr><td colspan="2" class="muted">No catalysts recorded.</td></tr>`;

  const notesHtml = !isNoteEmpty(study.notes)
    ? safeNoteHtml(study.notes)
    : '<span class="muted">No notes.</span>';

  /*
   * ── THE PLAN THE STUDY WAS FILED FROM ───────────────────────────────────────
   * The user's "case study nen giong trade plan mot chut, chua tat ca cac criteria … de sau nay
   * doc lai tot hon". Until now this document held the outcome and the chart but not one word of
   * the reasoning: the grade was a letter in the title with nothing behind it. A journal read
   * back a year later has to answer "what did I think I was buying", and the only place that
   * answer exists is the frozen checklist — so it goes in the file, not just in the app.
   *
   * Absent on every study written by hand in the Case Studies tab, and on everything filed
   * before the planner could freeze a plan, so the whole section is conditional. The grade is
   * checked field by field rather than trusted: this blob syncs, it is among the oldest data in
   * the app, and `scorecardTableHtml` walks `outcomes`.
   */
  const p = study.plan;
  const pg = p?.grade && Array.isArray(p.grade.outcomes) && typeof p.grade.score === 'number'
    ? p.grade : null;
  // Still read off the FROZEN plan rather than off the study: a plan filed before
  // `CaseStudy.currency` existed recorded euros here while the study above it recorded dollars, and
  // for those older studies each half has to keep printing the currency it was actually written in.
  const pc = p?.currency === 'EUR' ? '€' : '$';
  const pmoney = moneyIn(pc);
  // The acknowledgement, with the levels it was given against — unfalsifiable without them,
  // exactly as in the printed plan.
  const ack = p?.plan?.reviewedAt && p.plan.levels
    ? `<div class="ack ok">✓ Plan acknowledged ${esc(p.plan.reviewedAt.slice(0, 16).replace('T', ' '))}`
      + ` — against entry ${pmoney(p.plan.levels.entry)} / stop ${pmoney(p.plan.levels.stop)}</div>`
    : '<div class="ack bad">⚠ NOT acknowledged — the plan was never confirmed as read</div>';
  // The note as it was FILED, and only when it has since diverged. The planner copies the plan
  // note into `notes` at filing, so printing both would normally be the same paragraph twice —
  // but `notes` stays editable afterwards and the frozen copy does not, and where they disagree
  // the difference is the most interesting thing on the page.
  const filedNote = p?.plan?.note && !isNoteEmpty(p.plan.note)
    && safeNoteHtml(p.plan.note) !== safeNoteHtml(study.notes)
    ? `<h2>Plan note, as filed</h2><div class="notes">${safeNoteHtml(p.plan.note)}</div>`
    : '';
  const planBlock = p
    ? `<h2>Trade plan it was filed from</h2>
  <p class="sub">${esc(p.plan?.setup ? setupName(p.plan.setup, false) : study.setupType)}
    · trade date <b>${esc(p.date || study.keyDate)}</b>
    · grade <b>${esc(p.effective ?? '—')}</b>${pg ? ` (score ${pg.score.toFixed(0)}/100)` : ''}
    · size allowed <b>${p.pctOfFull}%</b> of full
    · levels as typed, in ${pc === '€' ? 'EUR' : 'USD'}</p>
  ${ack}
  <div class="grid">
    ${stat('Entry (planned)', pmoney(p.levels?.entry), '#5b8cff')}
    ${stat('Stop (planned)', pmoney(p.levels?.stop), '#ff5266')}
    ${stat('Target (planned)', pmoney(p.levels?.target), '#18d89a')}
    ${stat('Shares', p.shares > 0 ? String(p.shares) : '—')}
  </div>
  ${pg ? `<h2>${esc(scorecardWords(false).title)}</h2>${scorecardBarsHtml(pg, false)}
  ${scorecardTableHtml(pg, false)}`
      : '<p class="sub" style="color:#ffb648">This trade was never graded — no setup was chosen, '
        + 'or the price history was too short.</p>'}
  ${filedNote}`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(study.symbol)} — ${esc(study.title || 'Case Study')}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { background:#07080b; color:#e9edf4; font:14px/1.6 'Hanken Grotesk',system-ui,sans-serif; margin:0; padding:clamp(14px,4vw,32px); max-width:1040px; }
  h1 { font-size:24px; letter-spacing:-.03em; margin:0 0 2px; }
  .sub { color:#99a2b2; margin:0 0 4px; font-size:14px; }
  .pill { display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:3px 10px; border-radius:999px; border:1px solid; }
  .toolbar { margin:16px 0; }
  button { background:#18d89a; color:#04130d; border:0; border-radius:8px; padding:9px 16px; font-weight:700; font-size:13px; cursor:pointer; }
  .chart { background:#0c0e13; border:1px solid #1d222c; border-radius:12px; padding:10px; margin:16px 0; }
  .chart-note { font-size:11px; font-family:ui-monospace,monospace; margin-top:6px; }
  .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:16px 0; }
  .stat { background:#0c0e13; border:1px solid #1d222c; border-radius:10px; padding:10px 12px; min-width:0; }
  .stat .k { color:#5c6575; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
  .stat .v { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:16px; margin-top:3px; overflow-wrap:anywhere; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:#18d89a; margin:24px 0 8px; }
  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid #1d222c; font-size:13px; vertical-align:top; }
  .cat-date { font-family:'JetBrains Mono',monospace; color:#c084fc; white-space:nowrap; width:120px; }
  .notes { background:#0c0e13; border:1px solid #1d222c; border-radius:10px; padding:14px 16px; line-height:1.7; }
  .ack { border-radius:10px; padding:10px 14px; margin:16px 0; font-size:13px; border:1px solid; }
  .ack.ok { color:#18d89a; border-color:#18d89a44; background:#0d1a14; }
  .ack.bad { color:#ffb648; border-color:#ffb64844; background:#1a1509; }
${SCORECARD_CSS}
  .muted { color:#5c6575; }
  .foot { color:#5c6575; font-size:11px; margin-top:28px; border-top:1px solid #1d222c; padding-top:12px; }
  .why { background:#0c0e13; border:1px solid #1d222c; border-left:3px solid #e879f9; border-radius:10px; padding:12px 14px; margin:16px 0; }
  .why .k { color:#5c6575; font-size:11px; text-transform:uppercase; letter-spacing:.05em; margin-bottom:3px; }
  .ink { color:#5c6575; font-size:12px; margin-left:12px; cursor:pointer; user-select:none; }
${NARROW_CSS}
${PRINT_CSS}
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">🖨 Print / Save as PDF</button><label class="ink"><input type="checkbox" id="ink"> Print on white paper (saves ink)</label></div>

  <h1>${esc(study.symbol)} <span class="pill" style="color:${OUTCOME_COLOR[study.outcome]};border-color:${OUTCOME_COLOR[study.outcome]}">${OUTCOME_LABEL[study.outcome]}</span>${study.rating ? ` <span class="pill" style="color:${RATING_COLOR[study.rating] ?? '#99a2b2'};border-color:${RATING_COLOR[study.rating] ?? '#99a2b2'}">Grade ${esc(study.rating)}</span>` : ''}</h1>
  <p class="sub">${esc(study.title || '')}</p>
  <p class="sub">${esc(study.setupType)} · key date <b>${esc(study.keyDate)}</b> · ±${study.windowMonths} month window${
    // Said out loud only for a euro study. On a dollar one it would be noise on every document ever
    // exported; on a euro one it is the difference between a price the reader recognises and one
    // they think is wrong.
    eur ? ' · prices in <b>EUR</b>, chart converted at the key date’s rate' : ''
  }</p>

  <div class="chart">${svg}${earnNote}</div>

  <div class="grid">
    ${stat('Entry', money(study.entry), '#5b8cff')}
    ${stat('Stop', money(study.stop), '#ff5266')}
    ${stat('Target', money(study.target), '#18d89a')}
    ${stat('R:R (planned)', rr)}
    ${stat('Exit date', study.exitDate ? esc(study.exitDate) : '—')}
    ${stat('Exit price', money(study.exitPrice))}
    ${stat('Result R', study.rMultiple != null ? study.rMultiple.toFixed(2) + 'R' : '—', study.rMultiple != null ? (study.rMultiple >= 0 ? '#18d89a' : '#ff5266') : undefined)}
    ${stat('Outcome', OUTCOME_LABEL[study.outcome], OUTCOME_COLOR[study.outcome])}
    ${stat('Rating', study.rating || '—', study.rating ? (RATING_COLOR[study.rating] ?? undefined) : undefined)}
  </div>
  ${study.exitReason ? `<div class="why"><div class="k">Why it was closed</div><div>${esc(study.exitReason)}</div></div>` : ''}

  ${planBlock}

  <h2>Catalysts &amp; news</h2>
  <table><tbody>${catalystRows}</tbody></table>

  <h2>Notes &amp; lessons</h2>
  <div class="notes">${notesHtml}</div>

  <p class="foot">Generated ${esc(study.updatedAt)} · The Professional — case study journal · Educational use only. Not financial advice.</p>
</body></html>`;
}
