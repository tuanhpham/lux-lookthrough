import { describe, expect, it } from 'vitest';
import { TONE_RANGE, toneCss } from '../src/ui/theme.js';

describe('background brightness', () => {
  it('paints nothing at the shipped look', () => {
    expect(toneCss(0, 0)).toBe('');
  });
  it('lifts only the dark theme for a dark value', () => {
    const css = toneCss(100, 0);
    expect(css).toContain('html:not(.light)');
    expect(css).not.toContain('html.light');
    expect(css).toContain('body::after');
  });
  it('dims and brightens light in opposite directions', () => {
    expect(toneCss(0, -50)).toContain('rgba(70,58,40,');
    expect(toneCss(0, 50)).toContain('rgba(255,255,255,');
    expect(toneCss(0, 50)).not.toContain('html:not(.light)');
  });
  it('keeps dark one-way and light two-way', () => {
    expect(TONE_RANGE.dark[0]).toBe(0);
    expect(TONE_RANGE.light[0]).toBeLessThan(0);
  });
});
