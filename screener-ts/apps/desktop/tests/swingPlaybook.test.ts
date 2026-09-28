/**
 * The Learn book's §11 scorecard, which is GENERATED from `GRADE_CRITERIA`.
 *
 * ── WHY THIS FILE IS WORTH HAVING UNDER `environment: 'node'` ────────────────
 * Almost nothing in this tab can be tested: the app's vitest runs without a DOM, so the
 * wiring in `wireSwingPlaybook` has to be checked by eye. `swingPlaybookHtml` is the
 * exception — it is a pure `Lang => string`, so the MARKUP is testable even though the
 * behaviour is not. That is exactly the half worth guarding here, because the failure this
 * section is prone to is a silent one: §11 used to hold its own hand-written checklist, and
 * a criterion added to core simply never appeared in the book. Nobody would see a crash.
 *
 * So these tests assert the generated section covers every criterion core defines, in both
 * languages, with the words that make it teachable.
 */
import { describe, it, expect } from 'vitest';
import { GRADE_CRITERIA, GRADE_GROUPS, SETUP_KEYS } from '@screener/core';
import { swingPlaybookHtml } from '../src/tabs/swingPlaybook.js';
import { criterionLabel, criterionWhy, groupLabel } from '../src/portfolio/gradeWords.js';
import { setupName } from '../src/portfolio/planWords.js';

const EN = swingPlaybookHtml('en');
const VI = swingPlaybookHtml('vi');

describe('the generated scorecard', () => {
  it('gives every criterion a row, in both languages', () => {
    for (const c of GRADE_CRITERIA) {
      expect(EN, c.key).toContain(`data-swp-crit="${c.key}"`);
      expect(EN, c.key).toContain(`data-swp-ck="${c.key}"`);
      expect(VI, c.key).toContain(`data-swp-crit="${c.key}"`);
    }
  });

  it('prints the label, the weight and who says it matters', () => {
    // The weight is the honest replacement for the old must/plus split, and `authority` is
    // what makes a criterion arguable rather than arbitrary. A row with neither is a rule
    // handed down from nowhere.
    for (const c of GRADE_CRITERIA) {
      expect(EN, c.key).toContain(criterionLabel(c.key, false));
      expect(VI, c.key).toContain(criterionLabel(c.key, true));
      expect(EN, c.key).toContain(c.authority);
    }
  });

  it('carries the explanation for every criterion into the page', () => {
    // The user asked for somewhere to learn what the criteria mean. This is that place, so
    // the paragraph has to actually be in the HTML — not merely defined in `gradeWords`.
    for (const c of GRADE_CRITERIA) {
      const firstPara = (s: string) => s.split('\n\n')[0]!;
      expect(EN, c.key).toContain(firstPara(criterionWhy(c.key, false)));
      expect(VI, c.key).toContain(firstPara(criterionWhy(c.key, true)));
    }
  });

  it('declares each row’s scope so the wiring can filter by setup', () => {
    for (const c of GRADE_CRITERIA) {
      expect(EN).toContain(`data-swp-crit="${c.key}" data-swp-scope="${c.scope}"`);
    }
  });

  it('offers every setup as a choice', () => {
    // "Explain the criteria for each setup" starts with being able to pick the setup.
    for (const k of SETUP_KEYS) {
      expect(EN, k).toContain(`data-swp-setup="${k}"`);
      expect(EN, k).toContain(setupName(k, false));
      expect(VI, k).toContain(setupName(k, true));
    }
  });

  it('heads each group and gives it a subtotal the wiring can hide', () => {
    for (const g of GRADE_GROUPS) {
      const any = GRADE_CRITERIA.some((c) => c.group === g);
      if (!any) continue;
      expect(EN, g).toContain(`data-swp-grp="${g}"`);
      expect(EN, g).toContain(groupLabel(g, false));
      expect(VI, g).toContain(groupLabel(g, true));
    }
  });

  it('has no trace of the old hand-written checklist', () => {
    // The whole point of the rewrite was that the book stopped teaching a checklist with no
    // effect on anything. A `data-swp-ck="must"` back in this file would mean the two-lists
    // problem had returned — and the wiring reads `data-swp-ck` as a criterion KEY now, so
    // a stray "must" would also be scored as an unknown criterion.
    expect(EN).not.toContain('data-swp-ck="must"');
    expect(EN).not.toContain('data-swp-ck="plus"');
    expect(EN).not.toContain('Bonus points');
    expect(VI).not.toContain('Điểm cộng — cần ít nhất 4');
  });

  it('says which numbers the user may change and which are quotations', () => {
    // This section is where the user was told they could adapt the checklist. If the prose
    // promising movable A/B/C lines drifts out, the settings field is unreachable in
    // practice — nothing else in the app mentions it.
    expect(EN).toMatch(/A\/B\/C/);
    expect(EN).toContain('quotation');
    expect(EN).toContain('data-swp-cfg');
    expect(VI).toContain('trích dẫn');
  });

  it('reports the real criterion count rather than a number typed by hand', () => {
    // A hard-coded "22 criteria" is how the previous write-up of this work ended up wrong.
    expect(EN).toContain(`${GRADE_CRITERIA.length} criteria`);
    expect(VI).toContain(`${GRADE_CRITERIA.length} tiêu chí`);
  });

  it('renders both languages differently and neither one empty', () => {
    expect(EN.length).toBeGreaterThan(10_000);
    expect(VI.length).toBeGreaterThan(10_000);
    expect(EN).not.toBe(VI);
  });
});
