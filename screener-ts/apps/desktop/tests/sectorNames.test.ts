/**
 * The sector ETF dictionary. What matters is not that XLK says "Technology" — it is
 * that the eleven S&P sectors are all present and none of them collides, because a
 * missing one silently falls back to a bare ticker in exactly the table that exists
 * to answer "which sector".
 */
import { describe, it, expect } from 'vitest';
import { SECTORS, isDefensive, sectorName, sectorTip } from '../src/ui/sectorNames.js';

/** The eleven S&P sector SPDRs — the basket the ranking actually runs on. */
const SPDRS = ['XLB', 'XLC', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLRE', 'XLU', 'XLV', 'XLY'];

describe('SECTORS', () => {
  it('covers all eleven S&P sector SPDRs', () => {
    for (const s of SPDRS) expect(SECTORS[s], s).toBeDefined();
  });

  it('gives every entry both languages', () => {
    for (const [sym, info] of Object.entries(SECTORS)) {
      expect(info.en, sym).toBeTruthy();
      expect(info.vi, sym).toBeTruthy();
    }
  });

  it('never repeats a name — two tickers with one label is a table that lies', () => {
    const seen = new Map<string, string>();
    for (const [sym, info] of Object.entries(SECTORS)) {
      expect(seen.get(info.en), `${sym} duplicates ${seen.get(info.en)}`).toBeUndefined();
      seen.set(info.en, sym);
    }
  });

  it('is keyed by upper-case tickers only', () => {
    for (const sym of Object.keys(SECTORS)) expect(sym).toBe(sym.toUpperCase());
  });
});

describe('sectorName', () => {
  it('names a fund', () => {
    expect(sectorName('XLK')).toBe('Technology');
    expect(sectorName('XLV')).toBe('Health Care');
    expect(sectorName('SMH')).toBe('Semiconductors');
  });

  it('tolerates the case and padding a payload arrives with', () => {
    expect(sectorName(' xlre ')).toBe('Real Estate');
  });

  it('returns null for anything it does not know, so the caller can skip the line', () => {
    expect(sectorName('AAPL')).toBeNull();
    expect(sectorName('')).toBeNull();
    expect(sectorName(null)).toBeNull();
    expect(sectorName(undefined)).toBeNull();
  });
});

describe('sectorTip', () => {
  it('reads as one line: ticker, sector, then a few holdings', () => {
    expect(sectorTip('XLK')).toBe('XLK — Technology · Apple, Microsoft, Nvidia');
  });

  it('drops the holdings clause when there is none', () => {
    expect(sectorTip('XBI')).toBe('XBI — Biotech (equal weight)');
  });

  it('falls back to the symbol rather than to an empty tooltip', () => {
    expect(sectorTip('AAPL')).toBe('AAPL');
    expect(sectorTip(null)).toBe('');
  });
});

describe('isDefensive', () => {
  it('marks staples, utilities and health care', () => {
    for (const s of ['XLP', 'XLU', 'XLV']) expect(isDefensive(s), s).toBe(true);
  });

  it('does not mark the cyclicals', () => {
    for (const s of ['XLK', 'XLY', 'XLF', 'XLE', 'XLI', 'XLB', 'XLC', 'XLRE']) {
      expect(isDefensive(s), s).toBe(false);
    }
  });

  it('is false for an unknown symbol, never undefined', () => {
    expect(isDefensive('AAPL')).toBe(false);
    expect(isDefensive(null)).toBe(false);
  });
});
