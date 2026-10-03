import { describe, expect, it } from 'vitest';
import { brokerOf, DEFAULT_BROKER_FEES, feeOf } from '../src/portfolio/brokerFees.js';

describe('broker fees by account name', () => {
  it('recognises the broker however the name is written', () => {
    expect(brokerOf('Trade Republic Swing')?.fee).toBe(1);
    expect(brokerOf('trade-republic')?.fee).toBe(1);
    expect(brokerOf('Scalable Capital')?.fee).toBe(0.99);
    expect(brokerOf('DEGIRO long term')?.fee).toBe(2);
    expect(brokerOf('EquatePlus ESPP')?.fee).toBe(0);
    expect(brokerOf('Strategy A')).toBeNull();
  });

  it('an account override beats the table, and an unknown broker pays nothing', () => {
    expect(feeOf({ name: 'Trade Republic', fee: 0.5 })).toBe(0.5);
    expect(feeOf({ name: 'Trade Republic', fee: 0 })).toBe(0);
    expect(feeOf({ name: 'Trade Republic' })).toBe(1);
    expect(feeOf({ name: 'Paper' })).toBe(0);
  });

  it('uses the edited table, preferring the name the account starts with', () => {
    const rows = [...DEFAULT_BROKER_FEES, { name: 'Republic', fee: 9 }];
    expect(feeOf({ name: 'Trade Republic' }, rows.map((r) => (r.name === 'Trade Republic' ? { ...r, fee: 1.5 } : r)))).toBe(1.5);
    expect(brokerOf('Republic of Fees', rows)?.fee).toBe(9);
  });
});
