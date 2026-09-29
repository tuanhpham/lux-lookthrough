/**
 * The exit half of a trade plan, and the case study a finished plan becomes.
 *
 * ── WHY THIS FILE EARNS ITS KEEP ────────────────────────────────────────────
 * Everything here ends up written into the journal and never recomputed, so an arithmetic slip
 * does not show up as a wrong number on screen that the user corrects — it shows up as a filed
 * verdict on a trade, cited months later. The four things that can be got wrong:
 *
 *   1. R's SIGN and its denominator. R is the outcome measured against what was deliberately
 *      risked, so the divisor is the PLANNED stop, not where the trade actually got out. Get the
 *      sign wrong and a losing trade is filed as a winner.
 *   2. Which outcome a flat trade is. A journal that files every 0.1% scratch as a win reports a
 *      win rate that is really a coin-flip rate, and the user then reasons from it.
 *   3. 'open' when there is no exit price. The planner card exists mostly to plan trades that
 *      have not happened, so this is the COMMON case, not the edge one.
 *   4. The currency the case study is stored in. `CaseStudy` has no currency field at all: its
 *      chart draws these numbers against raw dollar closes, so a euro entry stored here would
 *      draw a line off the bottom of the axis. The conversion is the caller's job, which is
 *      exactly why the tests pin the contract as "dollars in, dollars out".
 */
import { describe, it, expect } from 'vitest';
import type { GradeResult } from '@screener/core';
import {
  autoCaseTitle,
  caseStudyFromPlan,
  emptyExit,
  exitMath,
  exitReasonLabel,
  exitReasonText,
  hasExit,
  type PlanExit,
} from '../src/portfolio/planExit.js';
import type { CasePlan } from '../src/caseStudies/store.js';
import { emptyPlan } from '../src/portfolio/planStore.js';

const exit = (p: Partial<PlanExit> = {}): PlanExit => ({ ...emptyExit(), ...p });

const GRADE: GradeResult = {
  grade: 'B',
  score: 74,
  outcomes: [],
} as unknown as GradeResult;

const PLAN: CasePlan = {
  symbol: 'NVDA',
  savedAt: '2026-09-29T10:00:00.000Z',
  date: '2024-05-20',
  plan: emptyPlan('NVDA'),
  grade: GRADE,
  effective: 'B',
  levels: { entry: 100, stop: 90, target: 130 },
  shares: 50,
  currency: 'EUR',
  pctOfFull: 75,
};

describe('exitMath', () => {
  it('measures the gain against the planned risk, not against where it got out', () => {
    // Risked 10 to make 20: +2R. The stop is what sets the unit.
    const m = exitMath({ entry: 100, stop: 90, shares: 10, date: '2024-05-20', exit: exit({ price: 120, date: '2024-06-20' }) });
    expect(m.rMultiple).toBe(2);
    expect(m.pctGain).toBe(20);
    expect(m.pnl).toBe(200);
    expect(m.outcome).toBe('win');
  });

  it('keeps R negative on a loss, and calls a loss a loss even when it beat the stop', () => {
    // Out at 96 on a 90 stop: money was lost, and it was 0.4 of the risk taken. A journal that
    // called this anything but a loss because the stop held would be flattering the user.
    const m = exitMath({ entry: 100, stop: 90, shares: 10, date: '2024-05-20', exit: exit({ price: 96 }) });
    expect(m.rMultiple).toBe(-0.4);
    expect(m.pnl).toBe(-40);
    expect(m.outcome).toBe('loss');
  });

  it('files a trade that finished flat as a scratch, not as a win', () => {
    expect(exitMath({ entry: 100, stop: 90, shares: 1, date: '2024-05-20', exit: exit({ price: 100.2 }) }).outcome)
      .toBe('scratch');
    expect(exitMath({ entry: 100, stop: 90, shares: 1, date: '2024-05-20', exit: exit({ price: 99.8 }) }).outcome)
      .toBe('scratch');
    // Just outside the band, and now it counts.
    expect(exitMath({ entry: 100, stop: 90, shares: 1, date: '2024-05-20', exit: exit({ price: 100.3 }) }).outcome)
      .toBe('win');
  });

  it('is open with no exit price, and still counts the days held', () => {
    const m = exitMath({ entry: 100, stop: 90, shares: 10, date: '2024-05-20', exit: exit({ date: '2024-06-20' }) });
    expect(m.outcome).toBe('open');
    expect(m.rMultiple).toBeNull();
    expect(m.pctGain).toBeNull();
    expect(m.pnl).toBeNull();
    // The date was given, so the holding period is knowable even though the outcome is not.
    expect(m.daysHeld).toBe(31);
  });

  it('is open with no entry either — a plan nobody has acted on yet', () => {
    const m = exitMath({ entry: null, stop: null, shares: 0, date: '', exit: emptyExit() });
    expect(m).toEqual({ rMultiple: null, pctGain: null, pnl: null, daysHeld: null, outcome: 'open' });
  });

  it('drops R rather than invent one when the stop is above the entry', () => {
    // A stop above the entry is a typo, not a short. Dividing by a negative risk would print a
    // confident negative R on a winning trade.
    const m = exitMath({ entry: 100, stop: 110, shares: 10, date: '2024-05-20', exit: exit({ price: 120 }) });
    expect(m.rMultiple).toBeNull();
    expect(m.pctGain).toBe(20);
    expect(m.outcome).toBe('win');
  });

  it('leaves pnl out when no share count was recorded', () => {
    // Reconstructing an old trade, the user may remember the prices and not the size. 0 shares
    // must read as "not known", never as a €0 result.
    expect(exitMath({ entry: 100, stop: 90, shares: 0, date: '2024-05-20', exit: exit({ price: 120 }) }).pnl).toBeNull();
  });

  it('does not clamp a negative holding period', () => {
    // An exit before the entry is a user error, and showing -5 days is how they find it.
    expect(exitMath({ entry: 100, stop: 90, shares: 1, date: '2024-05-20', exit: exit({ price: 120, date: '2024-05-15' }) }).daysHeld)
      .toBe(-5);
  });
});

describe('hasExit / exitReasonText', () => {
  it('sees nothing in an untouched exit', () => {
    expect(hasExit(emptyExit())).toBe(false);
    expect(hasExit(exit({ note: '   ' }))).toBe(false);
  });

  it('sees a reason with no price as worth keeping', () => {
    expect(hasExit(exit({ reason: 'panic' }))).toBe(true);
    expect(hasExit(exit({ date: '2024-06-20' }))).toBe(true);
  });

  it('joins the label and the sentence, and survives either one missing', () => {
    expect(exitReasonText(exit({ reason: 'stop', note: 'gapped through it' }), false))
      .toBe('Stop hit — gapped through it');
    expect(exitReasonText(exit({ reason: 'stop' }), false)).toBe('Stop hit');
    expect(exitReasonText(exit({ note: 'no idea, panicked' }), false)).toBe('no idea, panicked');
    expect(exitReasonText(emptyExit(), false)).toBe('');
  });

  it('speaks Vietnamese when asked', () => {
    expect(exitReasonLabel('panic', true)).toBe('Bán vì sợ — không theo kế hoạch');
    expect(exitReasonLabel('', true)).toBe('');
  });
});

describe('autoCaseTitle', () => {
  it('names a study the way the journal names one by hand', () => {
    expect(autoCaseTitle('nvda', '2024-05-20', 'VCP')).toBe('NVDA May 2024 VCP');
  });

  it('leaves the date out rather than printing Invalid Date', () => {
    expect(autoCaseTitle('NVDA', '', 'VCP')).toBe('NVDA VCP');
    expect(autoCaseTitle('NVDA', 'not-a-date', 'VCP')).toBe('NVDA VCP');
  });
});

describe('caseStudyFromPlan', () => {
  const base = {
    symbol: 'nvda',
    date: '2024-05-20',
    setup: 'VCP' as const,
    levels: { entry: 100, stop: 90, target: 130 },
    exit: exit({ price: 120, date: '2024-06-20', reason: 'target' as const, note: 'sold into strength' }),
    shares: 50,
    effective: 'B' as const,
    notes: '<p>Tight base.</p>',
    plan: PLAN,
    vi: false,
    todayIso: '2026-09-29',
  };

  it('files the trade with its verdict already computed', () => {
    const s = caseStudyFromPlan(base);
    expect(s.symbol).toBe('NVDA');
    expect(s.keyDate).toBe('2024-05-20');
    expect(s.outcome).toBe('win');
    expect(s.rMultiple).toBe(2);
    expect(s.exitPrice).toBe(120);
    expect(s.exitDate).toBe('2024-06-20');
    expect(s.exitReason).toBe('Target reached — sold into strength');
  });

  it('carries the levels through untouched — the caller converts, not this', () => {
    // The contract the header states: dollars in, dollars out. Silently scaling here would put
    // the conversion in two places and make the chart's lines depend on which one ran.
    const s = caseStudyFromPlan(base);
    expect(s.entry).toBe(100);
    expect(s.stop).toBe(90);
    expect(s.target).toBe(130);
  });

  it('maps the planner\'s letter onto the journal\'s rating rather than asking twice', () => {
    expect(caseStudyFromPlan(base).rating).toBe('B');
    expect(caseStudyFromPlan({ ...base, effective: null }).rating).toBe('');
  });

  it('uses the playbook row as the setup type, and falls back to Other', () => {
    expect(caseStudyFromPlan(base).setupType).toBe('VCP');
    expect(caseStudyFromPlan({ ...base, setup: '' }).setupType).toBe('Other');
  });

  it('generates a title when the user left the box empty, and keeps theirs when not', () => {
    expect(caseStudyFromPlan(base).title).toBe('NVDA May 2024 VCP');
    expect(caseStudyFromPlan({ ...base, title: '   ' }).title).toBe('NVDA May 2024 VCP');
    expect(caseStudyFromPlan({ ...base, title: 'The one I fumbled' }).title).toBe('The one I fumbled');
  });

  it('embeds the plan so the post-mortem cannot be edited after the outcome is known', () => {
    const s = caseStudyFromPlan(base);
    expect(s.plan).toBe(PLAN);
    expect(s.plan?.pctOfFull).toBe(75);
    // The plan's own currency is preserved: it is the currency the trade was sized in.
    expect(s.plan?.currency).toBe('EUR');
  });

  it('omits exitReason entirely when nothing was said', () => {
    const s = caseStudyFromPlan({ ...base, exit: exit({ price: 120 }) });
    expect('exitReason' in s).toBe(false);
  });

  it('files a plan with no exit as open, which is the normal case', () => {
    const s = caseStudyFromPlan({ ...base, exit: emptyExit() });
    expect(s.outcome).toBe('open');
    expect(s.exitPrice).toBeNull();
    expect(s.exitDate).toBeNull();
    expect(s.rMultiple).toBeNull();
  });

  it('keeps the id and creation date when re-saving over an existing study', () => {
    const s = caseStudyFromPlan({ ...base, id: 'cs-1', createdAt: '2024-06-21' });
    expect(s.id).toBe('cs-1');
    expect(s.createdAt).toBe('2024-06-21');
    expect(s.updatedAt).toBe('2026-09-29');
  });

  it('invents no catalysts', () => {
    // Catalysts are dated events the user enters in the journal's own editor. Deriving them from
    // a criteria summary would put made-up dates on a timeline that is read as fact.
    expect(caseStudyFromPlan(base).catalysts).toEqual([]);
  });
});
