/**
 * Theme-safe colours for rich-text notes.
 *
 * The bug this fixes: the note editor's palette offered `#e9edf4` — the dark
 * theme's `--text` — as its first swatch. In dark mode that reads as "default
 * text", so it is the natural thing to pick, but execCommand('foreColor')
 * bakes it into the saved HTML as `style="color:#e9edf4"`. Switch to light
 * mode and that near-white text sits on a cream card, effectively invisible.
 * Notes are synced and shared, so the wrong colour follows the user across
 * devices and into the exported report.
 *
 * The fix has two halves:
 *  - The palette no longer contains a theme-dependent colour at all. Instead
 *    of "default text" it offers RESET (drop the colour, inherit whatever the
 *    theme says), plus five accents chosen to have enough contrast on BOTH the
 *    dark `--card` (#141219) and the light one (#faf8f5).
 *  - `remapLegacyNoteColor` rescues notes already saved with the old palette,
 *    so existing case studies become readable without an edit.
 *
 * Kept in core (not the desktop app) because it is pure string logic and the
 * desktop package has no test runner.
 */

/**
 * Colours the old palette offered, lower-cased, that are unreadable in at
 * least one theme — mapped to the closest safe replacement.
 *
 * `#e9edf4` was the dark theme's --text (invisible on light) and `#0a0e16` is
 * the light theme's --text (invisible on dark); both mean "default text", so
 * they map to null → drop the colour and inherit. The remaining entries are
 * the old accents, nudged to versions that hold up on a cream background.
 */
const LEGACY_NOTE_COLORS: Record<string, string | null> = {
  '#e9edf4': null,
  '#e9edff': null,
  '#ffffff': null,
  '#fff': null,
  '#0a0e16': null,
  '#000000': null,
  '#000': null,
  '#18d89a': '#0f9f74',
  '#ff5266': '#e03050',
  '#ffb648': '#c77b06',
  '#5b8cff': '#3a6fe0',
  '#c084fc': '#9333ea',
};

/** Normalise `rgb(233, 237, 244)` / `#E9EDF4` / ` #e9edf4 ` to `#e9edf4`. */
function normalizeColor(raw: string): string {
  const s = raw.trim().toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (rgb) {
    const hex = (n: string | undefined): string =>
      Math.min(255, parseInt(n ?? '0', 10)).toString(16).padStart(2, '0');
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  // Expand #abc → #aabbcc so the 3- and 6-digit forms compare equal.
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short) {
    const [r, g, b] = [short[1] ?? '', short[2] ?? '', short[3] ?? ''];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return s;
}

/**
 * Given a colour saved in a note, return the colour to render.
 *
 * Returns null when the colour should be DROPPED so the text inherits the
 * theme's own foreground — that is the correct answer for anything that meant
 * "default text" in one theme, and it is what keeps the note readable in both.
 * Unknown colours (a user's own pick from some future palette) pass through
 * untouched; this is a targeted rescue, not a colour policy.
 */
export function remapLegacyNoteColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const key = normalizeColor(color);
  if (key in LEGACY_NOTE_COLORS) return LEGACY_NOTE_COLORS[key] ?? null;
  return color.trim() || null;
}

/**
 * The note editor's palette. `null` is the reset swatch (clear the colour and
 * inherit the theme). Every hex here was checked against both themes' card
 * backgrounds — nothing in this list disappears when the theme flips.
 */
export const NOTE_COLORS: readonly (string | null)[] = [
  null,        // reset → inherit the theme's text colour
  '#0f9f74',   // green
  '#e03050',   // red
  '#c77b06',   // amber
  '#3a6fe0',   // blue
  '#9333ea',   // violet
];
