import { describe, it, expect } from 'vitest';
import { NOTE_COLORS, remapLegacyNoteColor } from '../../src/analysis/noteColors.js';

/** The two theme foregrounds a saved note must never be pinned to. */
const DARK_TEXT = '#e9edf4';
const LIGHT_TEXT = '#0a0e16';

describe('remapLegacyNoteColor', () => {
  it('drops the dark theme text colour so the note inherits instead', () => {
    // This is the actual reported bug: white-ish note text on a cream card.
    expect(remapLegacyNoteColor(DARK_TEXT)).toBeNull();
  });

  it('drops the light theme text colour too', () => {
    expect(remapLegacyNoteColor(LIGHT_TEXT)).toBeNull();
  });

  it('drops plain white and black however they are written', () => {
    for (const c of ['#fff', '#FFF', '#ffffff', '#FFFFFF', '#000', '#000000']) {
      expect(remapLegacyNoteColor(c)).toBeNull();
    }
  });

  it('is case-insensitive', () => {
    expect(remapLegacyNoteColor('#E9EDF4')).toBeNull();
    expect(remapLegacyNoteColor('#18D89A')).toBe('#0f9f74');
  });

  it('tolerates surrounding whitespace', () => {
    expect(remapLegacyNoteColor('  #e9edf4 ')).toBeNull();
  });

  it('normalises the rgb() form the browser reports back', () => {
    // el.style.color round-trips through the DOM as rgb(), not hex.
    expect(remapLegacyNoteColor('rgb(233, 237, 244)')).toBeNull();
    expect(remapLegacyNoteColor('rgb(24,216,154)')).toBe('#0f9f74');
  });

  it('normalises rgba() as well', () => {
    expect(remapLegacyNoteColor('rgba(233, 237, 244, 1)')).toBeNull();
  });

  it('expands the 3-digit hex shorthand before comparing', () => {
    expect(remapLegacyNoteColor('#fff')).toBeNull();
  });

  it('nudges the old accents to versions that survive a light background', () => {
    expect(remapLegacyNoteColor('#18d89a')).toBe('#0f9f74');
    expect(remapLegacyNoteColor('#ff5266')).toBe('#e03050');
    expect(remapLegacyNoteColor('#ffb648')).toBe('#c77b06');
    expect(remapLegacyNoteColor('#5b8cff')).toBe('#3a6fe0');
    expect(remapLegacyNoteColor('#c084fc')).toBe('#9333ea');
  });

  it('passes an unrecognised colour straight through', () => {
    // A colour the user picked elsewhere is theirs; this is a rescue, not policy.
    expect(remapLegacyNoteColor('#123456')).toBe('#123456');
    expect(remapLegacyNoteColor('tomato')).toBe('tomato');
  });

  it('treats empty and missing input as no colour', () => {
    expect(remapLegacyNoteColor(null)).toBeNull();
    expect(remapLegacyNoteColor(undefined)).toBeNull();
    expect(remapLegacyNoteColor('')).toBeNull();
    expect(remapLegacyNoteColor('   ')).toBeNull();
  });

  it('is idempotent — remapping an already-safe colour changes nothing', () => {
    for (const c of NOTE_COLORS) {
      if (c === null) continue;
      expect(remapLegacyNoteColor(c)).toBe(c);
    }
  });
});

describe('NOTE_COLORS', () => {
  it('offers a reset swatch so "default text" means inherit, not a hex', () => {
    // The root cause of the bug was that "default" was a literal theme colour.
    expect(NOTE_COLORS[0]).toBeNull();
    expect(NOTE_COLORS.filter((c) => c === null)).toHaveLength(1);
  });

  it('contains neither theme foreground', () => {
    expect(NOTE_COLORS).not.toContain(DARK_TEXT);
    expect(NOTE_COLORS).not.toContain(LIGHT_TEXT);
  });

  it('has no duplicates', () => {
    expect(new Set(NOTE_COLORS).size).toBe(NOTE_COLORS.length);
  });

  it('keeps every swatch readable on both themes card backgrounds', () => {
    // WCAG relative luminance + contrast ratio. 3:1 is the large/bold-text bar;
    // note text is 14px+ and often bold, and these are accents rather than body
    // copy, so 3:1 is the line we hold. The point is that NOTHING vanishes.
    const lum = (hex: string): number => {
      const ch = (i: number): number => {
        const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
    };
    const ratio = (a: string, b: string): number => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const DARK_CARD = '#141219';
    const LIGHT_CARD = '#faf8f5';

    for (const c of NOTE_COLORS) {
      if (c === null) continue;
      expect(ratio(c, DARK_CARD), `${c} on the dark card`).toBeGreaterThanOrEqual(3);
      expect(ratio(c, LIGHT_CARD), `${c} on the light card`).toBeGreaterThanOrEqual(3);
    }
  });

  it('also keeps the remap TARGETS readable on both cards', () => {
    // Every legacy colour maps to either null or a NOTE_COLORS entry, so a
    // rescued note can never land on an untested colour.
    const targets = ['#0f9f74', '#e03050', '#c77b06', '#3a6fe0', '#9333ea'];
    for (const t of targets) expect(NOTE_COLORS).toContain(t);
  });
});
