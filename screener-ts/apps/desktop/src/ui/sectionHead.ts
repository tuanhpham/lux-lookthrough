/**
 * The heading INSIDE a section — "Rank history · 2 sessions · 2026-09-25 → 2026-09-28",
 * a calendar day, "My event risk" — as opposed to `.scan-head`, which opens one.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * These were built by hand at every call site: a `.section-title` div and, beside it,
 * some `<span class="tag">` pills. Three problems, all reported as "make it stand out
 * and look more professional":
 *
 *   · The label was 10px `--faint` uppercase — the quietest colour in the palette —
 *     with a hairline under the WORDS only. In a row with chips beside it the rule
 *     stopped halfway, so the group read as leftover UI rather than as a heading.
 *   · The chips were grey-on-grey with proportional digits, so "2 sessions" and
 *     "2026-09-25 → 2026-09-28" looked like the same kind of thing. One is a count
 *     and one is a span of time; a reader scanning for "how much history is this?"
 *     has to read both to find out which is which.
 *   · Nothing was shared, so each page drifted. The scanner had a local `tags()`
 *     helper, the calendar inlined its own, and the two do not match.
 *
 * ── THE IDEA ────────────────────────────────────────────────────────────────
 * A chip is DATA, so it is typed and its number is set in mono: `{ n: 2, text:
 * 'sessions' }` renders a bright monospace 2 next to a quiet word. Reading a column
 * of these, the numbers line up and the words get out of the way.
 *
 * `--st-tone` (default `--accent`) colours the first 56px of the heading's rule, so a
 * section about risk can carry `--danger` without anything here hard-coding a colour.
 * Same convention as `--pb-tone` in the playbook dialog.
 *
 * ── ESCAPING ────────────────────────────────────────────────────────────────
 * `label` and `sub` are HTML: they are authored/translated strings, and several call
 * sites legitimately pass an emoji plus a `<span class="muted">` aside. A chip's
 * `text` and `n` are DATA and are escaped here, so call sites must NOT pre-escape
 * them — a double-escaped ticker renders as `AMD&amp;`.
 */

/**
 * `count` a quantity · `date` a date or a span · `ok`/`warn`/`danger` a state ·
 * `plain` anything else. The kind is what makes a chip readable at a glance, so
 * prefer a wrong-looking `plain` over a `count` on something that is not counted.
 */
export type ChipKind = 'plain' | 'count' | 'date' | 'ok' | 'warn' | 'danger';

export interface Chip {
  /** The quiet half — a unit, a noun. Escaped here. */
  text?: string;
  /** The loud half — the number itself, set in mono. Escaped here. */
  n?: string | number;
  kind?: ChipKind;
  /** Native tooltip. A chip is small; anything that needs a sentence goes here. */
  title?: string;
}

/** What a call site may pass: a chip, a bare string, or something falsy to skip. */
export type ChipInput = Chip | string | false | null | undefined;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One chip. Returns `''` for an empty chip so callers can pass data straight through. */
export function chipHtml(input: ChipInput): string {
  if (!input) return '';
  const c: Chip = typeof input === 'string' ? { text: input } : input;
  const n = c.n === undefined || c.n === null ? '' : String(c.n);
  const text = c.text ?? '';
  if (!n && !text) return '';
  const kind = c.kind ?? 'plain';
  return `<span class="tag${kind === 'plain' ? '' : ` tag--${kind}`}"`
    + `${c.title ? ` title="${esc(c.title)}"` : ''}>`
    + `${n ? `<b>${esc(n)}</b>` : ''}${text ? esc(text) : ''}</span>`;
}

export interface SectionHeadOpts {
  /** A CSS colour for the rule's leading segment, e.g. `'var(--danger)'`. */
  tone?: string;
  /** One sentence under the heading. HTML, like `label`. */
  sub?: string;
  /** Right-aligned slot — a button, a link. HTML. */
  right?: string;
  /** Put on the wrapper, for `scroll-margin` anchors and jump links. */
  id?: string;
}

/**
 * A heading, its chips, and optionally one line of explanation.
 *
 * The chips are the point: a heading that says how much data it is drawn from is a
 * heading that can be checked. "Rank history" alone cannot be wrong; "Rank history,
 * 2 sessions" can be, and being able to be wrong is what makes it worth printing.
 */
export function sectionHead(
  label: string,
  chips: ChipInput[] = [],
  opts: SectionHeadOpts = {},
): string {
  const pills = chips.map(chipHtml).filter(Boolean).join('');
  return `<div class="sec-head"${opts.id ? ` id="${esc(opts.id)}"` : ''}`
    + `${opts.tone ? ` style="--st-tone:${opts.tone}"` : ''}>`
    + `<div class="section-title-row">`
    + `<h3 class="section-title">${label}</h3>`
    + pills
    + (opts.right ? `<span class="sec-head-sp"></span>${opts.right}` : '')
    + `</div>`
    + (opts.sub ? `<p class="sec-sub">${opts.sub}</p>` : '')
    + `</div>`;
}

/**
 * A count chip that says what it counted, and says so honestly when the list is
 * truncated: `5 / 40` rather than a bare `5` that reads as "there are five".
 */
export function countChip(shown: number, total?: number, unit?: string): Chip {
  const n = total !== undefined && total > shown ? `${shown} / ${total}` : String(shown);
  return { n, text: unit, kind: 'count' };
}

/** A span of dates, as one chip. Both ends, because either alone invites a guess. */
export function rangeChip(from: string, to: string, title?: string): Chip {
  return { n: from === to ? from : `${from} → ${to}`, kind: 'date', title };
}
