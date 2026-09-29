import { describe, it, expect } from 'vitest';
import {
  buildCriteriaPrompt,
  parseCriteriaAnswers,
  extractSummary,
  type CriteriaPromptContext,
} from '../../src/analysis/criteriaPrompt.js';

const base: CriteriaPromptContext = {
  symbol: 'sndk',
  date: '2024-05-17',
  setup: 'VCP',
  asks: [
    {
      key: 'epsGrowth',
      label: 'Earnings and sales are accelerating',
      authority: 'O’Neil (C + A)',
      weight: 8,
      how: 'read the last few quarterly reports',
    },
    { key: 'groupLeader', label: 'In a leading industry group' },
  ],
};

describe('buildCriteriaPrompt', () => {
  it('carries the symbol, the date and every key it wants answered', () => {
    const p = buildCriteriaPrompt(base);
    expect(p).toContain('SNDK');
    expect(p).toContain('2024-05-17');
    expect(p).toContain('[epsGrowth]');
    expect(p).toContain('[groupLeader]');
  });

  it('states the cut-off rule in both languages, naming the date', () => {
    // The whole feature is worthless without it: a model answering a 2024 question with 2025
    // information grades a decision on information the decider did not have.
    for (const lang of ['en', 'vi'] as const) {
      const p = buildCriteriaPrompt(base, lang);
      // The date appears in the cut-off sentence, not only in the header.
      expect(p.split('2024-05-17').length - 1).toBeGreaterThanOrEqual(3);
      expect(p).toContain('UNKNOWN');
    }
  });

  it('asks for the machine-readable block and the pasteable summary', () => {
    const p = buildCriteriaPrompt(base);
    expect(p).toContain('ANSWERS');
    expect(p).toContain('SUMMARY');
  });

  it('passes the app’s own measurements through so they can be contradicted', () => {
    const p = buildCriteriaPrompt({
      ...base,
      measured: [{ label: 'RS rank 80+', met: true, measured: 'RS 91' }],
    });
    expect(p).toContain('RS 91');
  });

  it('omits the levels line and the grade line when nothing was filled in', () => {
    const p = buildCriteriaPrompt({ symbol: 'AAA', date: '2026-01-02', asks: base.asks });
    expect(p).not.toContain('Levels I am planning');
    expect(p).not.toContain('Where my checklist stands');
  });

  it('shows the levels with the display currency when given', () => {
    const p = buildCriteriaPrompt({ ...base, entry: 100, stop: 92.5, cur: '€' });
    expect(p).toContain('entry €100');
    expect(p).toContain('stop €92.5');
    expect(p).not.toContain('target');
  });
});

describe('parseCriteriaAnswers', () => {
  it('reads the format the prompt asks for', () => {
    const r = parseCriteriaAnswers(`ANSWERS
[epsGrowth]: YES — EPS +41% in the Feb 2024 quarter, up from +18%
[groupLeader]: NO — the semis group lagged the S&P over Q1 2024
`);
    expect(r.answers).toEqual({ epsGrowth: true, groupLeader: false });
    expect(r.evidence.epsGrowth).toContain('+41%');
    expect(r.unknown).toEqual([]);
  });

  it('tolerates the shapes a model actually returns', () => {
    const r = parseCriteriaAnswers(`1. **epsGrowth**: yes - accelerating
- [groupLeader] : No
  institutional = UNKNOWN (no 13F filed before the date)`);
    expect(r.answers.epsGrowth).toBe(true);
    expect(r.answers.groupLeader).toBe(false);
    expect(r.unknown).toEqual(['institutional']);
  });

  it('accepts the Vietnamese verdicts', () => {
    const r = parseCriteriaAnswers('[earningsClear]: KHÔNG — báo cáo ra ngày 22/05\n[epsGrowth]: CÓ');
    expect(r.answers).toEqual({ earningsClear: false, epsGrowth: true });
  });

  it('ignores keys that were not asked about', () => {
    // A wrong match silently answers a criterion for the user, and the answer sizes a position.
    const r = parseCriteriaAnswers('[rsStrong]: YES\n[epsGrowth]: YES', ['epsGrowth']);
    expect(r.answers).toEqual({ epsGrowth: true });
  });

  it('lets UNKNOWN override an earlier answer for the same key', () => {
    const r = parseCriteriaAnswers('[epsGrowth]: YES\n[epsGrowth]: UNKNOWN');
    expect(r.answers.epsGrowth).toBeUndefined();
    expect(r.unknown).toEqual(['epsGrowth']);
  });

  it('finds nothing in prose that has no answer block', () => {
    const r = parseCriteriaAnswers('I looked at the chart and it seems fine: really strong.');
    expect(r.answers).toEqual({});
    expect(r.summary).toBe('');
  });
});

describe('extractSummary', () => {
  it('takes everything after the heading, including later notes', () => {
    const s = extractSummary(`EXPLANATIONS
blah

## SUMMARY
The setup was a textbook VCP.

Note: not advice.`);
    expect(s).toContain('textbook VCP');
    expect(s).toContain('Note: not advice.');
  });

  it('reads the Vietnamese heading', () => {
    expect(extractSummary('**Tóm tắt**\nNền giá chặt.')).toBe('Nền giá chặt.');
  });

  it('returns empty when there is no summary heading', () => {
    expect(extractSummary('ANSWERS\n[epsGrowth]: YES')).toBe('');
  });
});
