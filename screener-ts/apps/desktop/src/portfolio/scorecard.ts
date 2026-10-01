/**
 * The scorecard as printed HTML: the group bars and the criterion table.
 *
 * ── WHY IT IS ITS OWN MODULE ────────────────────────────────────────────────
 * The user's "case study nen giong trade plan mot chut, chua tat ca cac criteria … de sau nay
 * doc lai tot hon". Two exported documents now carry the same checklist — `planReport.ts` (what
 * the trade was supposed to be) and `caseStudies/report.ts` (what it turned out to be) — and
 * they are read as a pair. Rendering the table twice is how one of them ends up without a
 * column, or with the ✓ and ✗ the other way round, in a file the user cannot re-generate
 * because it was saved last year.
 *
 * Both documents are standalone files with no external CSS, so the styles travel with the
 * markup: `SCORECARD_CSS` is the other half of this module and every caller has to include it.
 * The class names are shared with the app's report stylesheets (`mono`, `small`, `muted`) and
 * are intentionally plain — these documents are read in a browser, not in the app.
 */
import { gradeByGroup, type GradeResult } from '@screener/core';
import { criterionLabel, groupLabel } from './gradeWords.js';
import { criterionSource, esc } from './gradeView.js';

/** The words the table's own chrome needs. `title` doubles as the section heading. */
export interface ScorecardWords {
  title: string;
  weight: string;
  measured: string;
  manual: string;
  per: string;
}

export function scorecardWords(vi: boolean): ScorecardWords {
  return vi
    ? { title: 'Bảng tiêu chí', weight: 'Trọng số', measured: 'Tự đo', manual: 'Tự trả lời', per: 'Theo' }
    : { title: 'Scorecard', weight: 'Weight', measured: 'Measured', manual: 'Answered by hand', per: 'Per' };
}

/**
 * Styles for everything this module emits. Include once per document.
 *
 * ── SIX COLUMNS ON A PHONE ──────────────────────────────────────────────────
 * The user's "table cho cac score cards cung vay, nhin khong hai hoa". A table cannot reflow the
 * way a grid can: every column keeps its widest cell, so the 26-row checklist simply ran off the
 * side of the screen. Two answers, in this order. The last two columns are metadata (which group
 * the criterion belongs to, which source measured it) — under 560px they leave the table and
 * reappear as a second line under the criterion's name, which is where a phone reader can
 * actually use them. Nothing is dropped; `.sc-meta` carries the same words. The `.sc-wrap`
 * scroller is the backstop for whatever is still too wide after that — a long `measured` string
 * scrolls sideways instead of stretching the document past the viewport.
 */
export const SCORECARD_CSS = `  .mono { font-family:'JetBrains Mono',ui-monospace,monospace; }
  .small { font-size:11px; }
  .mk { font-weight:700; }
  .gbar { display:flex; align-items:center; gap:10px; margin:4px 0; }
  .gbar-k { width:clamp(92px,30vw,200px); font-size:12px; color:#99a2b2; }
  .gbar-track { flex:1; min-width:40px; height:7px; background:#1d222c; border-radius:999px; overflow:hidden; }
  .gbar-fill { display:block; height:100%; }
  .gbar-n { width:60px; flex:none; text-align:right; font-family:'JetBrains Mono',monospace; font-size:11px; color:#99a2b2; }
  .sc-wrap { max-width:100%; overflow-x:auto; }
  .sc-meta { display:none; }
  @media (max-width: 560px) {
    .sc-wrap table { font-size:12px; }
    .sc-wrap th, .sc-wrap td { padding:5px 6px; }
    .sc-fold { display:none; }
    .sc-meta { display:block; margin-top:1px; }
  }`;

/** One bar per criterion group: how much of that group's weight was earned. */
export function scorecardBarsHtml(grade: GradeResult, vi: boolean): string {
  return gradeByGroup(grade)
    .filter((g) => g.possible > 0)
    .map((g) => {
      const share = (g.earned / g.possible) * 100;
      const col = share >= 80 ? '#18d89a' : share >= 50 ? '#ffb648' : '#ff5266';
      return `<div class="gbar"><span class="gbar-k">${esc(groupLabel(g.group, vi))}</span>
        <span class="gbar-track"><span class="gbar-fill" style="width:${share.toFixed(0)}%;background:${col}"></span></span>
        <span class="gbar-n">${g.earned}/${g.possible}</span></div>`;
    })
    .join('');
}

/**
 * Every criterion that was actually answered, with its tick or cross.
 *
 * Unasked automatic criteria are dropped, for the same reason the on-screen panel drops them:
 * a document printed with five greyed-out gap questions under a VCP teaches its reader that the
 * checklist is mostly blanks.
 */
export function scorecardTableHtml(grade: GradeResult, vi: boolean): string {
  const W = scorecardWords(vi);
  const rows = grade.outcomes
    .filter((c) => c.known || c.source !== 'auto')
    .map((c) => {
      const mark = !c.known ? '<span class="mk muted">–</span>'
        : c.met ? '<span class="mk" style="color:#18d89a">✓</span>'
          : '<span class="mk" style="color:#ff5266">✗</span>';
      const group = esc(groupLabel(c.group, vi));
      const src = esc(criterionSource(c.key));
      return `<tr>
        <td>${mark}</td>
        <td>${esc(criterionLabel(c.key, vi))}<span class="sc-meta muted small">${group} · ${W.per.toLowerCase()} ${src}</span></td>
        <td class="mono">${c.weight}</td>
        <td class="mono muted">${esc(c.measured ?? (c.source === 'auto' ? '' : W.manual))}</td>
        <td class="muted small sc-fold">${group}</td>
        <td class="muted small sc-fold">${src}</td>
      </tr>`;
    })
    .join('');
  return `<div class="sc-wrap"><table><thead><tr>
    <th></th><th>${esc(W.title)}</th><th>${esc(W.weight)}</th><th>${esc(W.measured)}</th><th class="sc-fold"></th><th class="sc-fold">${esc(W.per)}</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}
