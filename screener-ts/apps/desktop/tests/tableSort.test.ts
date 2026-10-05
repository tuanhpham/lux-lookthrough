import { describe, expect, it } from 'vitest';
import { _valueOf as v } from '../src/ui/tableSort.js';

describe('tableSort: reading a cell', () => {
  it('reads money in either notation, with the sign before or after the currency', () => {
    expect(v('€1,063.00 (+23.6%)')).toBe(1063);
    expect(v('€-5,960.00 (-99.3%)')).toBe(-5960);
    expect(v('-€5.20')).toBe(-5.2);
    expect(v('€3.337,74')).toBeCloseTo(3337.74);
    expect(v('$53,816M/day')).toBe(53816e6);
  });
  it('reads percents, R multiples, days and decimal commas', () => {
    expect(v('+7.5%')).toBe(7.5);
    expect(v('−21.4%')).toBe(-21.4);
    expect(v('13,6R')).toBeCloseTo(13.6);
    expect(v('45d')).toBe(45);
    expect(v('1,234')).toBe(1234);
  });
  it('keeps ISO dates as dates and words as words; a dash is missing', () => {
    expect(v('2026-08-20')).toBe('2026-08-20');
    expect(v('Trade Republic')).toBe('trade republic');
    expect(v('—')).toBeNull();
    expect(v('')).toBeNull();
  });
});
