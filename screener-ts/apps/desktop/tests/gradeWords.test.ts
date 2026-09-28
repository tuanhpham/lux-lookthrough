import { describe, it, expect } from 'vitest';
import { GRADE_CRITERIA, GRADE_GROUPS, GRADE_BARS } from '@screener/core';
import {
  CRITERION_LABEL, GROUP_LABEL, criterionLabel, groupLabel,
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
