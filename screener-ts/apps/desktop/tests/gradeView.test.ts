/**
 * The grade panel's markup — now shared by the Trade Planner and the Buy form.
 *
 * ── WHY THE MARKUP IS WORTH TESTING AND THE BEHAVIOUR CANNOT BE ─────────────
 * There is no DOM in this suite, so clicking a criterion has to be checked by eye. What CAN
 * be checked is the contract the wiring depends on, and that contract is entirely in the
 * attribute names: `data-bp-ans` / `data-bp-crit` for the Buy form, `data-tp-*` for the
 * planner. Both panels can be mounted at once — the planner panel stays alive while the user
 * scrolls to the Buy form — so if the namespace collapsed to one prefix, the planner's
 * delegated handler would answer criteria on the Buy form's panel and write the user's tick
 * into a plan they were not looking at. Nothing would throw.
 *
 * The other thing guarded here is that measured criteria stay READ-ONLY. A tri-state control
 * on a criterion the app computes brings back the self-chosen grade the checklist replaced,
 * spread over a dozen small decisions that each look like data entry.
 */
import { describe, it, expect } from 'vitest';
import { gradeByHand, GRADE_CRITERIA, criteriaForFamily } from '@screener/core';
import { criteriaRowsHtml, criterionSource, esc, gradeColor, gradePanelHtml } from '../src/portfolio/gradeView.js';

/** A real `GradeResult` with everything answered, so every row has something to render. */
const allTicked = gradeByHand(criteriaForFamily('base').map((c) => c.key), 'base');
/** And one with nothing ticked, so the crosses render too. */
const noneTicked = gradeByHand([], 'base');

const opts = {
  ns: 'bp', id: 'NVDA', vi: false, open: true,
  override: null, effective: 'A' as const, pctOfFull: 100,
};

describe('gradePanelHtml', () => {
  it('renders nothing at all when there is no grade', () => {
    // An empty string, not a placeholder: a stale letter or an empty box with a border beside
    // a freshly typed ticker reads as an answer.
    expect(gradePanelHtml(null, opts)).toBe('');
  });

  it('leads with the letter, the score and the size it allows', () => {
    const html = gradePanelHtml(allTicked, opts);
    expect(html).toContain('tp-grade-letter');
    expect(html).toContain('>A<');
    expect(html).toContain('100');
  });

  it('prints a dash rather than a letter when the score could not name one', () => {
    const html = gradePanelHtml(allTicked, { ...opts, effective: null });
    expect(html).toContain('>—<');
    expect(html).toContain(gradeColor(null));
  });

  it('says so when the user has overridden the computed letter', () => {
    // The override has to be visible. A panel that silently showed the user's letter as
    // though it were the score's is the checklist lying with a straight face.
    const over = gradePanelHtml(allTicked, { ...opts, override: 'D', effective: 'D' });
    expect(over).toContain('badge');
    expect(over).toContain(allTicked.grade ?? '—');
  });

  it('does not cry override when the user picked the letter the score already gave', () => {
    const same = gradePanelHtml(allTicked, {
      ...opts, override: allTicked.grade, effective: allTicked.grade,
    });
    expect(same).not.toContain('badge');
  });

  it('namespaces its controls, so two panels on one page cannot cross wires', () => {
    const bp = gradePanelHtml(allTicked, opts);
    const tp = gradePanelHtml(allTicked, { ...opts, ns: 'tp' });
    expect(bp).toContain('data-bp-crit="NVDA"');
    expect(bp).not.toContain('data-tp-');
    expect(tp).toContain('data-tp-crit="NVDA"');
    expect(tp).not.toContain('data-bp-');
  });

  it('hides the criteria until asked, and the toggle says which way it goes', () => {
    const shut = gradePanelHtml(allTicked, { ...opts, open: false });
    expect(shut).not.toContain('tp-crit-list');
    expect(shut).toContain('▸');
    expect(gradePanelHtml(allTicked, opts)).toContain('▾');
  });

  it('gives each scoring group a bar with its own subtotal', () => {
    const html = gradePanelHtml(allTicked, opts);
    // Everything ticked, so every bar is full — the point is that the bars exist and are
    // labelled, because "78/100" with no breakdown does not tell the user what to fix.
    expect(html).toContain('tp-gbar-fill');
    expect(html).toContain('width:100%');
  });
});

describe('criteriaRowsHtml', () => {
  it('offers yes/no only on the criteria the app cannot measure', () => {
    const html = criteriaRowsHtml(noneTicked, opts);
    for (const c of noneTicked.outcomes) {
      if (c.source === 'auto') {
        expect(html, c.key).not.toContain(`data-bp-ans="NVDA" data-key="${c.key}"`);
      } else {
        expect(html, c.key).toContain(`data-bp-ans="NVDA" data-key="${c.key}"`);
      }
    }
  });

  it('marks a met criterion with a tick and an unmet one with a cross', () => {
    expect(criteriaRowsHtml(allTicked, opts)).toContain('✓');
    expect(criteriaRowsHtml(noneTicked, opts)).toContain('✗');
  });

  it('prints every criterion’s weight, so the score is arguable', () => {
    const html = criteriaRowsHtml(allTicked, opts);
    for (const c of allTicked.outcomes) {
      expect(html, c.key).toContain(`<span class="tp-crit-w muted">${c.weight}</span>`);
    }
  });

  it('cites who says each criterion matters, on hover', () => {
    const html = criteriaRowsHtml(allTicked, opts);
    for (const c of allTicked.outcomes) {
      expect(html, c.key).toContain(esc(criterionSource(c.key)));
    }
  });

  it('labels the rows in Vietnamese when asked', () => {
    const en = criteriaRowsHtml(allTicked, opts);
    const vi = criteriaRowsHtml(allTicked, { ...opts, vi: true });
    expect(vi).not.toBe(en);
  });
});

describe('criterionSource', () => {
  it('finds the authority for every criterion core defines', () => {
    for (const c of GRADE_CRITERIA) expect(criterionSource(c.key), c.key).toBe(c.authority);
  });

  it('returns an empty string for a key that is not a criterion', () => {
    // Not the key itself: a raw key rendered into a `title` attribute reads as corrupted text.
    expect(criterionSource('notACriterion')).toBe('');
  });
});

describe('esc', () => {
  it('neutralises the characters that would break out of an attribute', () => {
    expect(esc('<b title="x">&</b>')).toBe('&lt;b title=&quot;x&quot;&gt;&amp;&lt;/b&gt;');
  });
});
