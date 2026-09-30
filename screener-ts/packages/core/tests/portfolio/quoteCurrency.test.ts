import { describe, it, expect } from 'vitest';
import { quoteCurrencyOf } from '../../src/portfolio/index.js';

describe('quoteCurrencyOf — the currency a Yahoo symbol is quoted in', () => {
  it('reads a bare US ticker, and a US share class, as dollars', () => {
    expect(quoteCurrencyOf('AAPL')).toBe('USD');
    // BRK.B is a share class, not a venue — the trap a naive "has a dot" check falls into.
    expect(quoteCurrencyOf('BRK.B')).toBe('USD');
    expect(quoteCurrencyOf('bf.b')).toBe('USD');
  });

  it('reads Xetra and the other euro venues as euros', () => {
    expect(quoteCurrencyOf('ALV.DE')).toBe('EUR');
    expect(quoteCurrencyOf(' sap.de ')).toBe('EUR');
    expect(quoteCurrencyOf('AIR.PA')).toBe('EUR');
    expect(quoteCurrencyOf('ASML.AS')).toBe('EUR');
    // Frankfurt floor: a ONE-letter suffix that is a venue, unlike BRK.B.
    expect(quoteCurrencyOf('ALV.F')).toBe('EUR');
  });

  it('reads Vietnamese listings as dong', () => {
    expect(quoteCurrencyOf('FPT.VN')).toBe('VND');
  });

  it('returns null for a market it has no rate for, rather than guessing dollars', () => {
    // London quotes in pence and Zurich in francs: read as dollars, both would be off by the whole rate.
    expect(quoteCurrencyOf('VOD.L')).toBeNull();
    expect(quoteCurrencyOf('NESN.SW')).toBeNull();
    expect(quoteCurrencyOf('7203.T')).toBeNull();
  });
});
