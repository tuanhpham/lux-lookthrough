/**
 * The "Ask ChatGPT the remaining criteria" plumbing.
 *
 * ── WHAT IS WORTH TESTING HERE ──────────────────────────────────────────────
 * There is no DOM in this suite, so the dialog itself is checked by eye. What matters and CAN
 * be checked is the two decisions the feature turns on:
 *
 *  • WHICH questions get asked. Asking a criterion the app already measures would invite the
 *    model to overrule a measurement; asking one the user has already answered, when others
 *    are still open, wastes the ask on the easy half.
 *  • What ends up in the note. The ticks this feature sets move the letter and therefore the
 *    share count, so each one has to arrive with its evidence line attached — a tick with no
 *    provenance cannot be audited a month later, which on a reconstructed past date is the
 *    entire exercise.
 */
import { describe, it, expect } from 'vitest';
import { gradeTrade, type ParsedCriteriaReply } from '@screener/core';
import { criteriaAskContext, criteriaNoteHtml, unansweredManual } from '../src/portfolio/criteriaAsk.js';

/** A graded card: the market read is known, the manual questions are not. */
const grade = gradeTrade({ regime: 'UPTREND', relativeStrength: 91 }, {});

const card = {
  symbol: 'SNDK',
  date: '2024-05-17',
  setupLabel: 'VCP',
  entry: 100,
  stop: 92,
  target: 120,
  cur: '$',
  grade,
  effective: 'B' as const,
  vi: false,
};

describe('unansweredManual', () => {
  it('returns only the manual criteria, and only the open ones', () => {
    const open = unansweredManual(grade);
    expect(open.every((o) => o.source === 'manual')).toBe(true);
    expect(open.map((o) => o.key).sort()).toEqual([
      'earningsClear', 'epsGrowth', 'groupLeader', 'institutional', 'noOverheadSupply',
    ]);
  });

  it('drops the ones already answered', () => {
    const some = gradeTrade({ regime: 'UPTREND' }, { epsGrowth: true, groupLeader: false });
    expect(unansweredManual(some).map((o) => o.key)).not.toContain('epsGrowth');
    expect(unansweredManual(some).map((o) => o.key)).not.toContain('groupLeader');
  });

  it('falls back to all five once every one has been answered', () => {
    // Pressing the button again is re-research, not a mistake — an empty prompt would read as
    // a broken button.
    const all = gradeTrade({}, {
      noOverheadSupply: true, earningsClear: true, epsGrowth: true, groupLeader: true, institutional: true,
    });
    expect(unansweredManual(all)).toHaveLength(5);
  });
});

describe('criteriaAskContext', () => {
  it('carries the cut-off date and the card’s levels', () => {
    const c = criteriaAskContext(card);
    expect(c.date).toBe('2024-05-17');
    expect(c.entry).toBe(100);
    expect(c.cur).toBe('$');
    expect(c.setup).toBe('VCP');
  });

  it('asks the open manual questions, with a label and the app’s own definition', () => {
    const c = criteriaAskContext(card);
    expect(c.asks.map((a) => a.key)).toContain('noOverheadSupply');
    const eps = c.asks.find((a) => a.key === 'epsGrowth')!;
    expect(eps.label).toMatch(/accelerating/i);
    // The definition is the longest thing in the prompt and the reason it works: the label
    // alone is a phrase two readers score differently.
    expect((eps.how ?? '').length).toBeGreaterThan(100);
    expect(eps.authority).toMatch(/O’Neil/);
  });

  it('hands over what the app measured, so the model can contradict it', () => {
    const c = criteriaAskContext(card);
    const rs = c.measured?.find((m) => m.measured === 'RS 91');
    expect(rs?.met).toBe(true);
  });

  it('never asks about a criterion the app measures itself', () => {
    const c = criteriaAskContext(card);
    expect(c.asks.map((a) => a.key)).not.toContain('rsStrong');
    expect(c.asks.map((a) => a.key)).not.toContain('regimeUptrend');
  });
});

describe('criteriaNoteHtml', () => {
  const reply: ParsedCriteriaReply = {
    answers: { epsGrowth: true, groupLeader: false },
    unknown: ['institutional'],
    evidence: {
      epsGrowth: 'EPS +41% in the Feb 2024 quarter, up from +18%',
      institutional: 'no 13F filed before the date',
    },
    summary: 'A tight base on a leader.\n\nThe group was not working <yet>.',
  };
  const asks = [
    { key: 'epsGrowth', label: 'Earnings and sales are accelerating' },
    { key: 'groupLeader', label: 'In a leading industry group' },
    { key: 'institutional', label: 'Signs of institutional accumulation' },
  ];

  it('files each answer with the evidence it came with', () => {
    const html = criteriaNoteHtml(reply, asks, '2024-05-17', false);
    expect(html).toContain('2024-05-17');
    expect(html).toContain('+41%');
    expect(html).toContain('Earnings and sales are accelerating');
  });

  it('writes an UNKNOWN as a question mark, not as a no', () => {
    const html = criteriaNoteHtml(reply, asks, '2024-05-17', false);
    expect(html).toContain('<b>?</b>');
  });

  it('turns blank lines into paragraphs and escapes the prose', () => {
    const html = criteriaNoteHtml(reply, asks, '2024-05-17', false);
    expect(html).toContain('<p>A tight base on a leader.</p>');
    expect(html).toContain('&lt;yet&gt;');
  });

  it('adds nothing at all when the reply carried nothing', () => {
    expect(criteriaNoteHtml({ answers: {}, unknown: [], evidence: {}, summary: '' }, asks, '2024-05-17', false)).toBe('');
  });
});
