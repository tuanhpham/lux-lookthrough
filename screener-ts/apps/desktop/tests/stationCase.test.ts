import { describe, expect, it } from 'vitest';
import { applySell, avgFill, caseForBuy, studyForLots } from '../src/portfolio/stationCase.js';

const buy = () => caseForBuy({
  symbol: 'nvda', accountId: 'a1', lotId: 'L1', date: '2026-09-01', shares: 10, price: 100, currency: 'USD',
  fee: 1, stop: 90, target: 130, setup: 'VCP', rating: 'B', notes: '', todayIso: '2026-09-01',
});

describe('station case studies', () => {
  it('opens at the buy with the fill and the lot it follows', () => {
    const c = buy();
    expect(c).toMatchObject({ symbol: 'NVDA', outcome: 'open', entry: 100, stop: 90, accountId: 'a1', lotIds: ['L1'] });
    expect(c.fills).toEqual([{ date: '2026-09-01', side: 'buy', shares: 10, price: 100, currency: 'USD', fee: 1 }]);
  });

  it('a partial sell keeps it open; the last share closes it at the average exit', () => {
    const c = buy();
    applySell(c, { date: '2026-09-10', shares: 5, price: 110, heldAfter: 5, reason: '' }, '2026-09-10');
    expect(c.outcome).toBe('open');
    expect(c.exitDate).toBeNull();
    applySell(c, { date: '2026-09-20', shares: 5, price: 130, heldAfter: 0, reason: 'Target hit', reasonKey: 'target' }, '2026-09-20');
    expect(avgFill(c.fills!, 'sell')).toBe(120);
    expect(c).toMatchObject({ outcome: 'win', exitDate: '2026-09-20', exitPrice: 120, rMultiple: 2, exitReasonKey: 'target' });
  });

  it('a loss below the planned stop is more than -1R', () => {
    const c = buy();
    applySell(c, { date: '2026-09-05', shares: 10, price: 85, heldAfter: 0, reason: 'Gap down' }, '2026-09-05');
    expect(c).toMatchObject({ outcome: 'loss', rMultiple: -1.5 });
  });

  it('finds the open study of the lots being sold, in that account only', () => {
    const c = buy();
    expect(studyForLots([c], 'a1', ['L1'])).toBe(c);
    expect(studyForLots([c], 'a2', ['L1'])).toBeNull();
    c.outcome = 'win';
    expect(studyForLots([c], 'a1', ['L1'])).toBeNull();
  });
});
