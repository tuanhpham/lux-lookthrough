/**
 * The conviction grade, as markup — shared by the Trade Planner and the Buy form.
 *
 * ── WHY THIS LEFT THE PLANNER TAB ───────────────────────────────────────────
 * The user's request is that buying goes THROUGH the trade plan: the same evaluation, in
 * the Buy form, before the trade is placed. "The same evaluation" has to mean the same
 * panel, not a second one that agrees today. The planner's version was ~90 lines welded to
 * its own `planEdits` map and its `data-tp-*` attributes; copying it into the Buy form
 * would have recreated the two-divergent-checklists problem that the §11 rewrite just
 * removed — and this time the two copies would be the one the user reads and the one that
 * sizes their position.
 *
 * So the markup is a pure function of a `GradeResult` here, and each screen keeps only its
 * own wiring. Being pure also makes it testable: the app's vitest runs without a DOM, so
 * this is the only form in which the panel can be checked at all.
 *
 * ── WHY THE CLASS NAMES STILL SAY `tp-` ─────────────────────────────────────
 * They are the existing stylesheet's names and the styles are unchanged. Read the prefix
 * as "trade plan", which is what both callers are now showing, rather than "trade planner
 * tab". Renaming them would touch every rule in `styles.css` for no behaviour.
 */
import {
  gradeByGroup, GRADE_CRITERIA,
  type ConvictionRating, type CriterionOutcome, type GradeResult,
} from '@screener/core';
import { criterionLabel, groupLabel } from './gradeWords.js';
import { num } from '../ui/dom.js';
import { t } from '../ui/i18n.js';

export interface GradeViewOpts {
  /**
   * The `data-` attribute namespace: `tp` in the planner, `bp` in the Buy form.
   *
   * Two screens can be alive at once — the planner panel stays mounted while the user
   * scrolls down to the Buy form. Shared attribute names would make the planner's
   * delegated click handler answer criteria on the Buy form's panel, writing the user's
   * tick into a plan they were not looking at.
   */
  ns: string;
  /** What the handlers get back in `dataset`: the symbol, for both callers today. */
  id: string;
  vi: boolean;
  /** Whether the criteria list is expanded. Collapsed by default — the letter is the headline. */
  open: boolean;
  /** The letter the user insisted on, if any, so the panel can say it is an override. */
  override: ConvictionRating | null;
  /** The letter actually in force: the override, else the computed one, else null. */
  effective: ConvictionRating | null;
  /** What share of full size that letter allows, from the ladder. For the headline only. */
  pctOfFull: number;
}

/** HTML-escape for text going into an attribute or a label. */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/** The colour a letter is worth saying out loud in. Null grades are grey, not red. */
export function gradeColor(g: ConvictionRating | null): string {
  return g === 'A' ? 'var(--up)'
    : g === 'B' ? 'var(--accent)'
      : g === 'C' ? 'var(--warn)'
        : g === 'D' ? 'var(--danger)' : 'var(--faint)';
}

/**
 * The grade, as a panel that shows its work.
 *
 * ── WHY THE AUTOMATIC ROWS ARE NOT CHECKBOXES ───────────────────────────────
 * Most of these criteria are measured off the bars, and they render as a tick, a cross or a
 * dash with the number beside them — read-only. A checkbox the user can untick when they
 * dislike the answer brings back exactly the problem the checklist replaced; it just
 * spreads it over a dozen smaller decisions, each of which looks like data entry. The
 * disagreement gets one honest place to live instead: the override dropdown.
 *
 * The manual rows ARE editable, and they are tri-state rather than a checkbox, because an
 * unticked box cannot say whether the user looked. Yes / No / neither — and neither is the
 * default, so an unanswered question changes nothing instead of counting as a failure.
 */
export function gradePanelHtml(grade: GradeResult | null, o: GradeViewOpts): string {
  if (!grade) return '';
  const answered = grade.outcomes.filter((c) => c.known).length;
  const letter = o.effective ?? '—';
  const letterColor = gradeColor(o.effective);
  const overridden = o.override !== null && o.override !== grade.grade;

  const groups = gradeByGroup(grade)
    .filter((g) => g.possible > 0)
    .map((g) => {
      const share = g.possible > 0 ? (g.earned / g.possible) * 100 : 0;
      const col = share >= 80 ? 'var(--up)' : share >= 50 ? 'var(--warn)' : 'var(--danger)';
      return `<span class="tp-gbar" title="${esc(groupLabel(g.group, o.vi))} ${g.earned}/${g.possible}">
        <span class="tp-gbar-k">${esc(groupLabel(g.group, o.vi))}</span>
        <span class="tp-gbar-track"><span class="tp-gbar-fill" style="width:${share.toFixed(0)}%;background:${col}"></span></span>
      </span>`;
    }).join('');

  return `
    <div class="tp-grade-head">
      <span class="tp-grade-letter" style="color:${letterColor};border-color:${letterColor}">${letter}</span>
      <span class="tp-grade-score">
        <b>${num(grade.score, 0)}</b><span class="muted">/100</span>
        <span class="muted"> · ${t('wl.plan.gradesize').replace('{pct}', String(o.pctOfFull))}</span>
      </span>
      ${overridden ? `<span class="badge" style="border-color:var(--warn);color:var(--warn)">${t('wl.plan.gradeoverridden').replace('{auto}', grade.grade ?? '—')}</span>` : ''}
      <button type="button" class="tp-crit-toggle" data-${o.ns}-crit="${esc(o.id)}">
        ${o.open ? '▾' : '▸'} ${t('wl.plan.criteria').replace('{n}', String(answered)).replace('{m}', String(grade.outcomes.length))}
      </button>
    </div>
    <div class="tp-gbars">${groups}</div>
    ${grade.grade === null ? `<div class="tp-grade-thin">${t('wl.plan.gradethin')}</div>` : ''}
    ${o.open ? criteriaRowsHtml(grade, o) : ''}`;
}

/** The criteria themselves, grouped, with the measurement or the tri-state control. */
export function criteriaRowsHtml(grade: GradeResult, o: GradeViewOpts): string {
  const byGroup = new Map<string, CriterionOutcome[]>();
  for (const c of grade.outcomes) {
    // Criteria for the other kind of setup are not "unanswered", they are not asked. A VCP
    // card listing five greyed-out gap questions teaches the user that the checklist is
    // mostly blanks.
    if (!c.known && c.source === 'auto') continue;
    const list = byGroup.get(c.group) ?? [];
    list.push(c);
    byGroup.set(c.group, list);
  }

  const sections = [...byGroup.values()].map((list) => {
    const rows = list.map((c) => {
      const mark = !c.known ? '<span class="tp-crit-mark muted">–</span>'
        : c.met ? '<span class="tp-crit-mark" style="color:var(--up)">✓</span>'
          : '<span class="tp-crit-mark" style="color:var(--danger)">✗</span>';
      const right = c.source === 'auto'
        ? `<span class="tp-crit-val muted">${esc(c.measured ?? '')}</span>`
        : `<span class="tp-crit-ask">
             <button type="button" class="tp-crit-btn${c.known && c.met ? ' yes' : ''}" data-${o.ns}-ans="${esc(o.id)}" data-key="${c.key}" data-val="yes">${t('wl.plan.yes')}</button>
             <button type="button" class="tp-crit-btn${c.known && !c.met ? ' no' : ''}" data-${o.ns}-ans="${esc(o.id)}" data-key="${c.key}" data-val="no">${t('wl.plan.no')}</button>
           </span>`;
      return `<div class="tp-crit-row${c.source === 'auto' ? ' auto' : ''}">
          ${mark}
          <span class="tp-crit-label" title="${esc(criterionSource(c.key))}">${esc(criterionLabel(c.key, o.vi))}</span>
          <span class="tp-crit-w muted">${c.weight}</span>
          ${right}
        </div>`;
    }).join('');
    return `<div class="tp-crit-group"><div class="tp-crit-gname">${esc(groupLabel(list[0]!.group, o.vi))}</div>${rows}</div>`;
  }).join('');

  return `<div class="tp-crit-list">${sections}<div class="tp-crit-foot muted">${t('wl.plan.critfoot')}</div></div>`;
}

/** Who says a criterion matters — shown on hover, so the checklist cites itself. */
export function criterionSource(key: string): string {
  return GRADE_CRITERIA.find((c) => c.key === key)?.authority ?? '';
}
