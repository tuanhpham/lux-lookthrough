/**
 * Self-contained HTML report for a case study: the embedded SVG chart, the
 * setup metadata, a catalyst timeline and the notes — styled like the app's
 * report serializer. Includes a Print button so the user can "Save as PDF" from
 * the browser. No external assets, so the file opens/prints fine offline.
 */
import type { Bar } from '@screener/core';
import type { CaseStudy } from './store.js';
import { caseSvgChart, windowBars } from './svgChart.js';
import { sanitizeNoteHtml, isNoteEmpty } from '../ui/richNote.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const money = (v: number | null): string => (v == null ? '—' : '$' + (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)));

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

/** Render the full standalone HTML document for a case study. */
export function caseStudyHtml(study: CaseStudy, bars: readonly Bar[]): string {
  const win = windowBars(bars, study.keyDate, study.windowMonths);
  const svg = caseSvgChart(win, study, { width: 980, height: 420 });

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
        .map((c) => `<tr><td class="cat-date">${esc(c.date)}</td><td>${sanitizeNoteHtml(c.text)}</td></tr>`)
        .join('')
    : `<tr><td colspan="2" class="muted">No catalysts recorded.</td></tr>`;

  const notesHtml = !isNoteEmpty(study.notes)
    ? sanitizeNoteHtml(study.notes)
    : '<span class="muted">No notes.</span>';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(study.symbol)} — ${esc(study.title || 'Case Study')}</title>
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
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid #1d222c; font-size:13px; vertical-align:top; }
  .cat-date { font-family:'JetBrains Mono',monospace; color:#c084fc; white-space:nowrap; width:120px; }
  .notes { background:#0c0e13; border:1px solid #1d222c; border-radius:10px; padding:14px 16px; line-height:1.7; }
  .muted { color:#5c6575; }
  .foot { color:#5c6575; font-size:11px; margin-top:28px; border-top:1px solid #1d222c; padding-top:12px; }
  @media print { body { background:#fff; color:#000; padding:0; } .toolbar { display:none; } .chart,.stat,.notes { background:#fafafa; border-color:#ddd; } }
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>

  <h1>${esc(study.symbol)} <span class="pill" style="color:${OUTCOME_COLOR[study.outcome]};border-color:${OUTCOME_COLOR[study.outcome]}">${OUTCOME_LABEL[study.outcome]}</span></h1>
  <p class="sub">${esc(study.title || '')}</p>
  <p class="sub">${esc(study.setupType)} · key date <b>${esc(study.keyDate)}</b> · ±${study.windowMonths} month window</p>

  <div class="chart">${svg}</div>

  <div class="grid">
    ${stat('Entry', money(study.entry), '#5b8cff')}
    ${stat('Stop', money(study.stop), '#ff5266')}
    ${stat('Target', money(study.target), '#18d89a')}
    ${stat('R:R (planned)', rr)}
    ${stat('Exit date', study.exitDate ? esc(study.exitDate) : '—')}
    ${stat('Exit price', money(study.exitPrice))}
    ${stat('Result R', study.rMultiple != null ? study.rMultiple.toFixed(2) + 'R' : '—', study.rMultiple != null ? (study.rMultiple >= 0 ? '#18d89a' : '#ff5266') : undefined)}
    ${stat('Outcome', OUTCOME_LABEL[study.outcome], OUTCOME_COLOR[study.outcome])}
  </div>

  <h2>Catalysts &amp; news</h2>
  <table><tbody>${catalystRows}</tbody></table>

  <h2>Notes &amp; lessons</h2>
  <div class="notes">${notesHtml}</div>

  <p class="foot">Generated ${esc(study.updatedAt)} · The Professional — case study journal · Educational use only. Not financial advice.</p>
</body></html>`;
}
