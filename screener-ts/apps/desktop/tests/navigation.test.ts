/**
 * The search palette's matching, and the page registry it searches.
 *
 * Pinned because both fail silently: a matcher that stops ignoring diacritics just
 * finds nothing for "tai chinh", and a tab added to main.ts but not to pages.ts is
 * simply missing from the menu and the palette — no error anywhere.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fold, score } from '../src/ui/commandPalette.js';
import { PAGES, PAGE_GROUPS } from '../src/ui/pages.js';

const item = (title: string, extra: { sub?: string; words?: string } = {}) => ({ title, group: 'Pages', ...extra });

describe('fold', () => {
  it('drops Vietnamese diacritics and case', () => {
    expect(fold('Tình trạng Tài chính')).toBe('tinh trang tai chinh');
    expect(fold('Đồng bộ')).toBe('dong bo');
  });
});

describe('score', () => {
  it('matches unaccented input against accented titles', () => {
    expect(score(item('Tình trạng tài chính'), 'tai chinh')).toBeGreaterThan(0);
  });
  it('needs every word to appear', () => {
    expect(score(item('Portfolio'), 'portfolio zebra')).toBe(0);
  });
  it('ranks a title-start hit above a description hit', () => {
    const a = score(item('Settings'), 'set');
    const b = score(item('Learn', { sub: 'reset your settings' }), 'set');
    expect(a).toBeGreaterThan(b);
  });
  it('searches the hidden words', () => {
    expect(score(item('Financial Status', { words: 'wealth bank' }), 'bank')).toBeGreaterThan(0);
  });
  it('treats regex characters as text', () => {
    expect(() => score(item('P&L (EUR)'), '(eur')).not.toThrow();
  });
});

describe('page registry', () => {
  it('lists every tab exactly once, in a known group', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    const tabs = /const TABS = \[([^\]]*)\]/.exec(main)?.[1]?.match(/'([a-z]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
    expect(tabs.length).toBeGreaterThan(10);
    expect([...PAGES.map((p) => p.id)].sort()).toEqual([...tabs].sort());
    const groups = new Set(PAGE_GROUPS.map((g) => g.id));
    for (const p of PAGES) expect(groups.has(p.group)).toBe(true);
  });
});
