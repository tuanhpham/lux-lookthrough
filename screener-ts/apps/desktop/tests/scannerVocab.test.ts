/**
 * The scanner's vocabulary. DOM-free, so it runs under `environment: 'node'`; the
 * language stays English throughout because `setLang` touches `document`.
 *
 * What is worth locking here is the FALLBACK, not the dictionary. The dictionary is
 * seeded by hand and will always be incomplete — the scanner lives in another repo
 * and can add a reason any night. So the tests say: a miss must never look like a
 * hit, a miss must still be readable, and the raw key must survive into the tooltip
 * so the gap can be closed.
 */
import { describe, it, expect } from 'vitest';
import { normKey, reasonLabel, setupLabel } from '../src/tabs/scannerVocab.js';

describe('normKey', () => {
  it('collapses every separator the scanner might use', () => {
    const want = 'khong_du_thanh_khoan';
    for (const raw of ['khong_du_thanh_khoan', 'Khong du thanh khoan',
      'KHONG-DU-THANH-KHOAN', 'khong  du__thanh.khoan', '_khong_du_thanh_khoan_']) {
      expect(normKey(raw)).toBe(want);
    }
  });
});

describe('setupLabel', () => {
  it('spells out a code and keeps the code', () => {
    expect(setupLabel('BO').text).toBe('Breakout (BO)');
    expect(setupLabel('EP').text).toBe('Episodic Pivot (EP)');
    expect(setupLabel('MR').text).toBe('Mean Reversion (MR)');
  });

  it('does not print "VCP (VCP)"', () => {
    expect(setupLabel('VCP').text).toBe('VCP');
  });

  it('is case- and whitespace-insensitive, like a payload key never is', () => {
    expect(setupLabel('bo').text).toBe('Breakout (BO)');
    expect(setupLabel(' Pb ').text).toBe('Pullback (PB)');
  });

  it('passes an unknown code through rather than inventing a name for it', () => {
    const l = setupLabel('ZZ9');
    expect(l.known).toBe(false);
    expect(l.text).toBe('ZZ9');
    expect(l.tip).toBe('ZZ9');
  });

  it('explains the codes whose name is still jargon', () => {
    expect(setupLabel('VCP').tip).toContain('Volatility Contraction');
    expect(setupLabel('EP').tip).toContain('gap');
  });
});

describe('reasonLabel', () => {
  it('translates a known reason into a sentence fragment', () => {
    expect(reasonLabel('thanh_khoan_thap').text).toBe('Liquidity too low');
    expect(reasonLabel('stop_qua_rong').text).toBe('Stop too wide');
    expect(reasonLabel('nen_qua_sau').text).toBe('Base too deep');
  });

  it('accepts the two counter keys the payload is known to carry', () => {
    // These arrive with a leading underscore and are filtered out upstream, but the
    // dictionary answers for them anyway — a caller that stops filtering must not
    // start printing `_qua_loc`.
    expect(reasonLabel('_qua_loc').known).toBe(true);
    expect(reasonLabel('_bi_cat_tran').text).toContain('ceiling');
  });

  it('marks an unmapped reason as unknown and keeps the raw key for the tooltip', () => {
    const l = reasonLabel('mot_ly_do_hoan_toan_moi');
    expect(l.known).toBe(false);
    expect(l.tip).toBe('mot_ly_do_hoan_toan_moi');
  });

  it('still makes an unmapped reason readable — underscores are not words', () => {
    expect(reasonLabel('mot_ly_do_moi').text).toBe('Mot ly do moi');
    expect(reasonLabel('_an_internal_counter').text).toBe('An internal counter');
    expect(reasonLabel('CHUA-CO-NEN-GI').known).toBe(false);
  });

  it('never returns an empty label, whatever it is handed', () => {
    for (const raw of ['', '_', '___', '   ']) {
      expect(reasonLabel(raw).text.length).toBeGreaterThan(0);
    }
  });
});
