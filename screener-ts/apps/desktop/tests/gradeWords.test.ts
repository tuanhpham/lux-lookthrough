import { describe, it, expect } from 'vitest';
import { GRADE_CRITERIA, GRADE_GROUPS, GRADE_BARS } from '@screener/core';
import {
  CRITERION_LABEL, GROUP_LABEL, CRITERION_WHY, SCOPE_LABEL, SOURCE_LABEL,
  criterionLabel, groupLabel, criterionWhy, scopeLabel, sourceLabel,
} from '../src/portfolio/gradeWords.js';

describe('gradeWords', () => {
  it('has a label for every criterion core defines', () => {
    // The failure this guards against is silent: a criterion added to core with no label
    // renders as a raw key in the middle of the checklist, and only in production.
    for (const c of GRADE_CRITERIA) {
      expect(CRITERION_LABEL[c.key], c.key).toBeDefined();
    }
  });

  it('has no labels for criteria that no longer exist', () => {
    const keys = new Set(GRADE_CRITERIA.map((c) => c.key));
    for (const key of Object.keys(CRITERION_LABEL)) expect(keys.has(key), key).toBe(true);
  });

  it('has a label for every group', () => {
    for (const g of GRADE_GROUPS) expect(GROUP_LABEL[g], g).toBeDefined();
  });

  it('says both languages, and says something different in each', () => {
    for (const [key, [vi, en]] of Object.entries(CRITERION_LABEL)) {
      expect(vi.length, key).toBeGreaterThan(5);
      expect(en.length, key).toBeGreaterThan(5);
      expect(vi, key).not.toBe(en);
    }
  });

  it('prints the threshold inside the label, in both languages', () => {
    // Without the number a red cross is a verdict the user cannot check. With it, they
    // can look at the chart and see whether the app or the rule is what they disagree with.
    const checks: [string, string][] = [
      ['rsStrong', String(GRADE_BARS.RS_STRONG)],
      ['rsElite', String(GRADE_BARS.RS_ELITE)],
      ['near52wHigh', String(GRADE_BARS.NEAR_HIGH_PCT)],
      ['baseTight', String(GRADE_BARS.MAX_BASE_DEPTH_PCT)],
      ['contractions', String(GRADE_BARS.MIN_CONTRACTIONS)],
      ['volumeDryUp', String(GRADE_BARS.MIN_VOLUME_DRYUP_PCT)],
      ['gapSize', String(GRADE_BARS.MIN_GAP_PCT)],
      ['priorAdvance', String(GRADE_BARS.MIN_PRIOR_ADVANCE_PCT)],
      ['rrOk', String(GRADE_BARS.MIN_RR)],
      ['stopSane', String(GRADE_BARS.MAX_STOP_PCT)],
    ];
    for (const [key, n] of checks) {
      expect(criterionLabel(key, true), `${key} vi`).toContain(n);
      expect(criterionLabel(key, false), `${key} en`).toContain(n);
    }
  });

  it('falls back to the key rather than to nothing', () => {
    // A blank row is a bug the user cannot report; a raw key is one they can quote.
    expect(criterionLabel('somethingNew', false)).toBe('somethingNew');
  });

  it('picks the language it was asked for', () => {
    expect(criterionLabel('aboveMa50', false)).toBe(CRITERION_LABEL.aboveMa50![1]);
    expect(criterionLabel('aboveMa50', true)).toBe(CRITERION_LABEL.aboveMa50![0]);
    expect(groupLabel('market', false)).toBe('Market');
    expect(groupLabel('market', true)).toBe('Thị trường');
  });
});

describe('the explanations', () => {
  it('explains every criterion, in both languages', () => {
    // The user asked for somewhere to learn what these mean. A criterion with a label but
    // no explanation is one they can only ever tick on faith.
    for (const c of GRADE_CRITERIA) {
      expect(CRITERION_WHY[c.key], c.key).toBeDefined();
      expect(criterionWhy(c.key, true).length, `${c.key} vi`).toBeGreaterThan(120);
      expect(criterionWhy(c.key, false).length, `${c.key} en`).toBeGreaterThan(120);
    }
  });

  it('explains rather than restating the label', () => {
    // The cheap way to satisfy the test above is to paste the label in. That teaches nobody
    // anything, so require the explanation to be substantially longer than the claim.
    for (const c of GRADE_CRITERIA) {
      for (const vi of [true, false]) {
        const why = criterionWhy(c.key, vi);
        const label = criterionLabel(c.key, vi);
        expect(why, `${c.key} ${vi ? 'vi' : 'en'}`).not.toBe(label);
        expect(why.length, `${c.key} ${vi ? 'vi' : 'en'}`).toBeGreaterThan(label.length * 2);
      }
    }
  });

  it('has no explanations for criteria that no longer exist', () => {
    const keys = new Set(GRADE_CRITERIA.map((c) => c.key));
    for (const key of Object.keys(CRITERION_WHY)) expect(keys.has(key), key).toBe(true);
  });

  it('says so when a criterion is only asked of some setups — and only then', () => {
    // The copy and the declared `scope` are two statements of the same fact, written in two
    // places by hand. This is what keeps them from drifting: a criterion narrowed to one
    // family later must have its paragraph updated, and a paragraph claiming a restriction
    // that `scope` does not impose is a lie the user has no way to catch.
    for (const c of GRADE_CRITERIA) {
      const limited = c.scope !== 'always';
      expect(criterionWhy(c.key, true).includes('Chỉ hỏi'), `${c.key} vi / ${c.scope}`)
        .toBe(limited);
      expect(criterionWhy(c.key, false).includes('Only asked'), `${c.key} en / ${c.scope}`)
        .toBe(limited);
    }
  });

  it('tells the user which boxes are theirs to fill in', () => {
    // A manual criterion that reads like an automatic one looks broken: the user waits for
    // a number that is never coming. Every manual paragraph has to say whose job it is.
    for (const c of GRADE_CRITERIA) {
      if (c.source !== 'manual') continue;
      expect(criterionWhy(c.key, true), c.key).toMatch(/tự (điền|xem|trả lời|nhìn)|mắt bạn|Cách xem/);
      expect(criterionWhy(c.key, false), c.key).toMatch(/[Yy]ours to|your eyes|by eye|to check/);
    }
  });

  it('names a scope and a source for every value core can emit', () => {
    for (const c of GRADE_CRITERIA) {
      expect(SCOPE_LABEL[c.scope], c.scope).toBeDefined();
      expect(SOURCE_LABEL[c.source], c.source).toBeDefined();
      expect(scopeLabel(c.scope, true), c.scope).not.toBe(c.scope);
      expect(sourceLabel(c.source, false), c.source).not.toBe(c.source);
    }
  });

  it('returns nothing, not a key, for an explanation it does not have', () => {
    // Opposite choice from `criterionLabel`: a missing paragraph should render as no
    // paragraph. A raw key in the middle of the Learn book reads as corrupted text.
    expect(criterionWhy('somethingNew', true)).toBe('');
    expect(criterionWhy('somethingNew', false)).toBe('');
  });
});
