/**
 * A Yahoo close is in its venue's currency — AAPL in dollars, ALV.DE in euros.
 *
 * Before German stocks every conversion divided a close by EURUSD for a euro account, so Allianz
 * at €350 would have been valued at ≈€300 with nothing on screen to say so. These pin the two
 * helpers every conversion now goes through: `quoteToCcy` for money, `candleDivisor` for charts.
 */
import { describe, it, expect } from 'vitest';
import type { Bar } from '@screener/core';
import { applyEurUsdBars, ccyFactor, quoteToCcy } from '../src/portfolio/fx.js';
import { candleDivisor, inCurrency } from '../src/portfolio/planExit.js';

const bar = (date: string, close: number): Bar => ({ date, open: close, high: close, low: close, close, volume: 0 });

describe('quoteToCcy — a close into account money', () => {
  it('is 1 before any rate is loaded (the display fallback)', () => {
    // Runs first, while the module's rate table is still empty.
    expect(quoteToCcy('AAPL', 'EUR', '2026-09-01')).toBe(1);
  });

  it('divides a dollar quote and leaves a euro quote alone in a euro account', () => {
    applyEurUsdBars([bar('2026-09-01', 1.25)]);
    expect(quoteToCcy('AAPL', 'EUR', '2026-09-01')).toBeCloseTo(0.8);
    expect(quoteToCcy('ALV.DE', 'EUR', '2026-09-01')).toBe(1);
  });

  it('multiplies a euro quote in a dollar account', () => {
    applyEurUsdBars([bar('2026-09-01', 1.25)]);
    expect(quoteToCcy('ALV.DE', 'USD', '2026-09-01')).toBeCloseTo(1.25);
    expect(quoteToCcy('AAPL', 'USD', '2026-09-01')).toBe(1);
  });

  it('converts nothing it has no rate for', () => {
    applyEurUsdBars([bar('2026-09-01', 1.25)]);
    expect(quoteToCcy('FPT.VN', 'EUR', '2026-09-01')).toBe(1);
    expect(quoteToCcy('VOD.L', 'EUR', '2026-09-01')).toBe(1);
    expect(ccyFactor('EUR', 'VND', '2026-09-01')).toBe(1);
  });
});

describe('candleDivisor — candles into the plan currency', () => {
  it('needs no rate when the ticker already quotes in the plan currency', () => {
    expect(candleDivisor('ALV.DE', 'EUR', 0)).toBe(0);
    expect(candleDivisor('AAPL', 'USD', 0)).toBe(0);
  });

  it('refuses (null) when a rate is needed and missing, so no chart draws its lines off the axis', () => {
    expect(candleDivisor('AAPL', 'EUR', 0)).toBeNull();
    expect(candleDivisor('ALV.DE', 'USD', 0)).toBeNull();
  });

  it('brings euro candles into a dollar plan by multiplying', () => {
    const d = candleDivisor('ALV.DE', 'USD', 1.25)!;
    expect(inCurrency([bar('2026-09-01', 350)], d)[0]!.close).toBeCloseTo(437.5);
  });

  it('still divides dollar candles into a euro plan', () => {
    const d = candleDivisor('AAPL', 'EUR', 1.25)!;
    expect(inCurrency([bar('2026-09-01', 250)], d)[0]!.close).toBeCloseTo(200);
  });
});
