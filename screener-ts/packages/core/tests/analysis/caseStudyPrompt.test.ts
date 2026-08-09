import { describe, it, expect } from 'vitest';
import {
  buildCaseStudyPrompt,
  caseContextBlock,
  type CaseStudyPromptContext,
} from '../../src/analysis/caseStudyPrompt.js';
import {
  chatGptAskUrl,
  MAX_FRAGMENT_PROMPT_LENGTH,
} from '../../src/analysis/researchPrompts.js';

const base: CaseStudyPromptContext = {
  symbol: 'sndk',
  keyDate: '2026-01-06',
  setupType: 'VCP',
};

describe('caseContextBlock', () => {
  it('upper-cases the symbol and always carries the key date', () => {
    const b = caseContextBlock(base);
    expect(b).toContain('Symbol: SNDK');
    expect(b).toContain('2026-01-06');
  });

  it('omits every optional field that is absent', () => {
    const b = caseContextBlock({ symbol: 'AAA', keyDate: '2026-02-02' });
    expect(b).not.toContain('entry');
    expect(b).not.toContain('Exit');
    expect(b).not.toContain('Realized R');
    expect(b).not.toContain('Catalysts I recorded');
    expect(b).not.toContain('My other case studies');
  });

  it('lists only the levels that were filled in', () => {
    const b = caseContextBlock({ ...base, entry: 145.5, target: 180 });
    expect(b).toContain('entry 145.5');
    expect(b).toContain('target 180');
    expect(b).not.toContain('stop');
  });

  it('keeps a zero level rather than treating it as missing', () => {
    // 0 is falsy but a real recorded number; a `if (c.stop)` test would drop it.
    const b = caseContextBlock({ ...base, stop: 0 });
    expect(b).toContain('stop 0');
  });

  it('drops non-finite numbers', () => {
    const b = caseContextBlock({ ...base, entry: NaN, rMultiple: Infinity });
    expect(b).not.toContain('entry');
    expect(b).not.toContain('Realized R');
  });

  it('renders a partial exit without inventing the missing half', () => {
    const b = caseContextBlock({ ...base, exitDate: '2026-02-10' });
    expect(b).toContain('2026-02-10 @ ?');
  });

  it('sorts catalysts by date and strips HTML from the text', () => {
    const b = caseContextBlock({
      ...base,
      catalysts: [
        { date: '2026-01-20', text: '<b>Earnings</b> beat&nbsp;badly' },
        { date: '2026-01-05', text: 'Analyst <i>upgrade</i> to $200' },
      ],
    });
    const first = b.indexOf('2026-01-05');
    const second = b.indexOf('2026-01-20');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(b).toContain('Analyst upgrade to $200');
    expect(b).toContain('Earnings beat badly');
    expect(b).not.toContain('<b>');
  });

  it('does not mutate the caller’s catalyst array while sorting', () => {
    const catalysts = [
      { date: '2026-03-01', text: 'later' },
      { date: '2026-01-01', text: 'earlier' },
    ];
    caseContextBlock({ ...base, catalysts });
    expect(catalysts[0]!.date).toBe('2026-03-01');
  });

  it('skips a catalyst whose text is empty once HTML is stripped', () => {
    const b = caseContextBlock({
      ...base,
      catalysts: [{ date: '2026-01-07', text: '<p><br></p>' }],
    });
    expect(b).not.toContain('Catalysts I recorded');
  });

  it('labels fields in Vietnamese when asked', () => {
    const b = caseContextBlock({ ...base, outcome: 'win' }, 'vi');
    expect(b).toContain('Mã: SNDK');
    expect(b).toContain('Kết quả: win');
    expect(b).not.toContain('Symbol:');
  });
});

describe('buildCaseStudyPrompt', () => {
  it('puts symbol, setup and key date on the INPUT line', () => {
    const p = buildCaseStudyPrompt(base);
    expect(p).toContain('SNDK · VCP · key date 2026-01-06');
  });

  it('falls back to a generic setup label when none was recorded', () => {
    const p = buildCaseStudyPrompt({ symbol: 'AAA', keyDate: '2026-01-06' });
    expect(p).toContain('AAA · breakout · key date 2026-01-06');
  });

  it('keeps every required section in both languages', () => {
    for (const lang of ['en', 'vi'] as const) {
      const p = buildCaseStudyPrompt(base, lang);
      expect(p).toContain('# ROLE');
      expect(p).toContain('# INPUT');
      expect(p.split('\n').filter((l) => l.startsWith('# ')).length).toBe(7);
    }
  });

  it('defaults to English', () => {
    expect(buildCaseStudyPrompt(base)).toBe(buildCaseStudyPrompt(base, 'en'));
  });

  it('demands real looked-up data and forbids invented numbers', () => {
    const en = buildCaseStudyPrompt(base, 'en');
    expect(en).toMatch(/DO NOT INVENT NUMBERS/);
    expect(en).toMatch(/data not found/);
    const vi = buildCaseStudyPrompt(base, 'vi');
    expect(vi).toMatch(/KHÔNG được bịa số liệu/);
    expect(vi).toMatch(/không tìm thấy dữ liệu/);
  });

  it('asks for the key date itself to be verified', () => {
    // The recorded date is a memory; analysing the wrong session confidently is the
    // failure this instruction exists to prevent.
    expect(buildCaseStudyPrompt(base, 'en')).toMatch(/VERIFY AND CORRECT/);
    expect(buildCaseStudyPrompt(base, 'vi')).toMatch(/XÁC MINH & HIỆU CHỈNH/);
  });

  it('requires the red flags, not just the strengths', () => {
    expect(buildCaseStudyPrompt(base, 'en')).toMatch(/RED FLAGS/);
    expect(buildCaseStudyPrompt(base, 'vi')).toMatch(/CỜ ĐỎ/);
  });

  it('carries the not-investment-advice reminder', () => {
    expect(buildCaseStudyPrompt(base, 'en')).toMatch(/NOT investment advice/);
    expect(buildCaseStudyPrompt(base, 'vi')).toMatch(
      /KHÔNG phải khuyến nghị đầu/,
    );
  });

  it('appends the journal context so the model can contradict it', () => {
    const p = buildCaseStudyPrompt({ ...base, entry: 145.5, outcome: 'win' }, 'en');
    expect(p).toContain('WHAT MY JOURNAL RECORDS');
    expect(p).toContain('entry 145.5');
    expect(p.indexOf('WHAT MY JOURNAL RECORDS')).toBeGreaterThan(p.indexOf('# PRINCIPLES'));
  });

  it('passes the other case titles through for the comparison table', () => {
    const p = buildCaseStudyPrompt({ ...base, otherCases: ['NVDA breakout', 'AVGO VCP'] }, 'en');
    expect(p).toContain('NVDA breakout; AVGO VCP');
  });

  it('still reaches ChatGPT with the prompt embedded, in both languages', () => {
    // The point of the test: this prompt is long, and percent-encoding inflates
    // Vietnamese diacritics ~3x (~8.5 KB encoded), so it exceeds the query-string
    // cap. `chatGptAskUrl` must therefore route it through the fragment rather than
    // degrading to paste-only — which is what the user asked NOT to have to do.
    const full: CaseStudyPromptContext = {
      ...base,
      title: 'SNDK NAND upcycle breakout',
      entry: 145.5,
      stop: 132,
      target: 210,
      outcome: 'win',
      rating: 'A',
      catalysts: [{ date: '2026-01-06', text: 'Analyst upgrade, NAND pricing up' }],
    };
    for (const lang of ['en', 'vi'] as const) {
      const p = buildCaseStudyPrompt(full, lang);
      const ask = chatGptAskUrl(p, 'https://chatgpt.com/g/g-abc', { autorun: true });
      expect(ask.embedded).toBe(true);
      expect(encodeURIComponent(p).length).toBeLessThan(MAX_FRAGMENT_PROMPT_LENGTH);
    }
  });
});
