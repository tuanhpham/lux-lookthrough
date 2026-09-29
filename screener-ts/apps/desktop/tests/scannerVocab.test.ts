/**
 * The scanner's vocabulary. DOM-free, so it runs under `environment: 'node'`; the
 * language stays English throughout because `setLang` touches `document`.
 *
 * The keys asserted here are COPIED from `Github/scanner/setups.py` — every one is a
 * literal `_rej(rej, "…")` argument or a counter that `scan()` writes. Two things
 * are locked: that those real keys resolve, and that the fallback still behaves when
 * the scanner adds a gate — a miss must never look like a hit, must still read as
 * words, and must carry the raw key into the tooltip so the gap can be closed.
 */
import { describe, it, expect } from 'vitest';
import {
  alertKindLabel, normKey, playbookNote, reasonLabel, setupLabel, setupWord, tableLabel,
} from '../src/tabs/scannerVocab.js';

describe('normKey', () => {
  it('collapses every separator the scanner might use', () => {
    const want = 'kem_thanh_khoan';
    for (const raw of ['kem_thanh_khoan', 'Kem thanh khoan', 'KEM-THANH-KHOAN',
      'kem  thanh__khoan', '_kem_thanh_khoan_']) {
      expect(normKey(raw)).toBe(want);
    }
  });

  it('survives the punctuation the real keys contain', () => {
    expect(normKey('khong co so lieu RS (thieu ma chuan?)'))
      .toBe('khong_co_so_lieu_rs_thieu_ma_chuan');
    expect(normKey('thieu gia / pivot')).toBe('thieu_gia_pivot');
  });
});

describe('setupLabel', () => {
  it('spells out the three setups the scanner actually emits', () => {
    expect(setupLabel('BO').text).toBe('Breakout (BO)');
    expect(setupLabel('RV').text).toBe('Reversal (RV)');
    expect(setupLabel('LEAD').text).toBe('Sector leader (LEAD)');
  });

  it('is case- and whitespace-insensitive, like a payload key never is', () => {
    expect(setupLabel('bo').text).toBe('Breakout (BO)');
    expect(setupLabel(' Lead ').text).toBe('Sector leader (LEAD)');
  });

  it('passes an unknown code through rather than inventing a name for it', () => {
    // `EP` and `VCP` are famous setups that this scanner does not have. A dictionary
    // that answered for them would be describing a table the app never receives.
    for (const code of ['EP', 'VCP', 'ZZ9']) {
      const l = setupLabel(code);
      expect(l.known).toBe(false);
      expect(l.text).toBe(code);
      expect(l.tip).toBe(code);
    }
  });

  it('explains what LEAD is, because the name alone is misleading', () => {
    // It is a quality floor, not a chart pattern — the one setup a reader is likely
    // to misread from its label.
    expect(setupLabel('LEAD').tip).toContain('quality floor');
  });
});

describe('reasonLabel', () => {
  it('translates the static gates, exactly as setups.py spells them', () => {
    expect(reasonLabel('kem thanh khoan').text).toBe('Liquidity too low');
    expect(reasonLabel('khong co nen tich luy').text).toBe('No base yet');
    expect(reasonLabel('duoi sma50').text).toBe('Below the 50-day average');
    expect(reasonLabel('day 52 tuan qua cu').text).toBe('The 52-week low is too old');
    expect(reasonLabel('khong biet sector').text).toBe('Sector unknown');
    expect(reasonLabel('yeu hon SPY trong 63 phien').text)
      .toBe('Weaker than SPY over 63 sessions');
    expect(reasonLabel('khong co so lieu RS (thieu ma chuan?)').known).toBe(true);
  });

  it('says what "bien do khong co lai" means, which the words alone do not', () => {
    // `atr_contract > max_atr_contract`: volatility failed to CONTRACT. Read literally
    // the phrase suggests the opposite.
    expect(reasonLabel('bien do khong co lai').text).toBe('Volatility did not contract');
    expect(reasonLabel('bien do khong co lai').tip).toContain('quieter');
  });

  it('keeps the threshold when the scanner interpolated one', () => {
    // The number IS the information in these rows.
    expect(reasonLabel('gia < $10.0').text).toBe('Price below $10.0');
    expect(reasonLabel('rvol < 1.5').text).toBe('RVOL below 1.5');
    expect(reasonLabel('nen rong hon 25%').text).toBe('Base wider than 25%');
    expect(reasonLabel('cach dinh 52 tuan > 15%').text)
      .toBe('More than 15% below the 52-week high');
    expect(reasonLabel('chua roi du 30%').text).toBe('Less than 30% off its high');
    expect(reasonLabel('thanh khoan < $20M/phien').text)
      .toBe('Dollar volume below $20M a session');
    expect(reasonLabel('bien do < 2% (khong du dong)').text)
      .toBe('Volatility below 2% — too quiet');
    expect(reasonLabel('bien do > 6% (stop qua rong)').text)
      .toBe('Volatility above 6% — the stop would be too wide');
    expect(reasonLabel('qua tran 12 ma tong').text).toBe('Over the 12-name total cap');
    expect(reasonLabel('tang < 5%').text).toBe('Up less than 5% today');
    for (const raw of ['gia < $10.0', 'rvol < 1.5', 'qua tran 12 ma tong']) {
      expect(reasonLabel(raw).known).toBe(true);
    }
  });

  it('names the sector behind a per-sector cap, in the tooltip', () => {
    const l = reasonLabel('da du 2 ma cua XLK');
    expect(l.text).toBe('Already 2 names from XLK');
    expect(l.tip).toContain('Technology');
    // An ETF this app has no name for still resolves — the cap is the point.
    expect(reasonLabel('da du 2 ma cua ZZZZ').text).toBe('Already 2 names from ZZZZ');
  });

  it('answers for the counters, which are tallies and not reasons', () => {
    // They arrive `_`-prefixed and `scannerTab` filters them out of the table. The
    // dictionary answers anyway: a caller that stops filtering must not print `_qua_loc`.
    expect(reasonLabel('_qua_loc').text).toBe('Passed the filter');
    expect(reasonLabel('_qua_san').text).toBe('Cleared the quality floor');
    expect(reasonLabel('_bi_cat_tran').text).toContain('ceiling');
    expect(reasonLabel('_cho_fund').known).toBe(true);
    expect(reasonLabel('_khong_lap_duoc_ke_hoach').known).toBe(true);
  });

  it('explains the empty LEAD table instead of leaving it silent', () => {
    const l = reasonLabel('khong co danh sach sector');
    expect(l.text).toBe('No sector ranking available');
    expect(l.tip).toContain('top sectors');
  });

  it('marks an unmapped reason as unknown and keeps the raw key for the tooltip', () => {
    const l = reasonLabel('mot ly do hoan toan moi');
    expect(l.known).toBe(false);
    expect(l.tip).toBe('mot ly do hoan toan moi');
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

/**
 * The three lookups added because the Scanner page printed pipeline internals in the
 * middle of translated prose — the user's "tieng viet va tieng anh lan lon trong khi user
 * chon tieng anh". Each one is a string the VM sends that used to reach the page raw.
 */
describe('playbookNote', () => {
  it('translates the cell note the VM sends in accented Vietnamese', () => {
    // The loudest leak on the page: the most prominent sentence in section 01.
    expect(playbookNote('UPTREND', 'CONTRACTED'))
      .toBe('The best case: tight bases, and a breakout has room to run.');
    expect(playbookNote('DOWNTREND', 'EXPANDED')).toMatch(/^A downtrend/);
    expect(playbookNote('RANGE', 'NORMAL')).toMatch(/mean-reversion/);
  });

  it('covers all twelve cells of config.PLAYBOOK', () => {
    for (const trend of ['UPTREND', 'UPTREND_UNDER_STRESS', 'RANGE', 'DOWNTREND']) {
      for (const vol of ['CONTRACTED', 'NORMAL', 'EXPANDED']) {
        const s = playbookNote(trend, vol, 'RAW');
        expect(s, `${trend}|${vol}`).not.toBe('RAW');
        expect(s.length).toBeGreaterThan(20);
      }
    }
  });

  it('falls back to the note as it arrived rather than to an empty cell', () => {
    // A regime pair this app has never heard of still has to print the day's instruction:
    // a missing rule is worse than an untranslated one.
    expect(playbookNote('SIDEWAYS_CHOP', 'NORMAL', 'Mot ghi chu moi')).toBe('Mot ghi chu moi');
    expect(playbookNote(null, null, 'Mot ghi chu moi')).toBe('Mot ghi chu moi');
    expect(playbookNote(undefined, undefined)).toBe('');
  });
});

describe('alertKindLabel', () => {
  it('says what NEW and UP actually mean', () => {
    // The distinction is the column's whole reason for existing: an `UP` is the same
    // opportunity getting stronger, not a second one.
    expect(alertKindLabel('NEW').text).toBe('First');
    expect(alertKindLabel('UP').text).toBe('Stronger');
    expect(alertKindLabel('UP').tip).toMatch(/same opportunity/);
    expect(alertKindLabel('new').known).toBe(true);
  });

  it('prints a dash for a missing kind and marks an unknown one', () => {
    expect(alertKindLabel(null).text).toBe('—');
    expect(alertKindLabel('').text).toBe('—');
    expect(alertKindLabel('DOWN').known).toBe(false);
  });
});

describe('tableLabel', () => {
  it('turns the D1 schema names into words', () => {
    // `struct` is not a word in either language, and it was hardcoded in two places.
    expect(tableLabel('struct').text).toBe('Measured symbols');
    expect(tableLabel('struct').tip).toMatch(/one row per symbol/i);
    expect(tableLabel('bars').text).toBe('Daily bars');
    expect(tableLabel('candidates').known).toBe(true);
  });
});

describe('the SPIKE setup', () => {
  it('has a name, because a playbook cell lists it', () => {
    // It is intraday-only, so it never heads a candidates table — but `PLAYBOOK[...]
    // ["setups"]` names it, and there it was rendering as a bare code.
    expect(setupWord('SPIKE').text).toBe('Volume spike');
    expect(setupLabel('SPIKE').text).toBe('Volume spike (SPIKE)');
  });
});
