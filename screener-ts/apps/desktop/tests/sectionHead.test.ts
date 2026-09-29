/**
 * `ui/sectionHead.ts` builds HTML strings, so it is testable without a DOM — which
 * matters, because this suite runs `environment: 'node'`.
 *
 * Two things are locked here and nothing else:
 *  1. Chip DATA is escaped, chip STRUCTURE is not. A ticker or a group key arrives
 *     from storage and goes straight in, so `<` must never survive as markup.
 *  2. A count says how much it is hiding. `12` and `12 / 40` mean different things
 *     to a reader deciding whether to trust the table under the heading.
 */
import { describe, it, expect } from 'vitest';
import { chipHtml, countChip, rangeChip, sectionHead } from '../src/ui/sectionHead.js';

describe('chipHtml', () => {
  it('sets the figure in <b> and leaves the unit quiet', () => {
    expect(chipHtml({ n: 2, text: 'sessions' })).toBe('<span class="tag"><b>2</b>sessions</span>');
  });

  it('escapes both halves — a chip carries data, not markup', () => {
    const html = chipHtml({ n: '<b>1</b>', text: 'a & b "c" <d>' });
    expect(html).toContain('&lt;b&gt;1&lt;/b&gt;');
    expect(html).toContain('a &amp; b &quot;c&quot; &lt;d&gt;');
    // The only tags in the output are the ones this function wrote itself.
    expect(html.match(/<(?!\/?(span|b)\b)/)).toBeNull();
  });

  it('escapes the tooltip too', () => {
    expect(chipHtml({ text: 'x', title: 'he said "no"' })).toContain('title="he said &quot;no&quot;"');
  });

  it('renders a bare string as the quiet half', () => {
    expect(chipHtml('partial data')).toBe('<span class="tag">partial data</span>');
  });

  it('returns nothing for falsy or empty chips, so callers can pass data through', () => {
    expect(chipHtml(null)).toBe('');
    expect(chipHtml(undefined)).toBe('');
    expect(chipHtml(false)).toBe('');
    expect(chipHtml('')).toBe('');
    expect(chipHtml({})).toBe('');
    expect(chipHtml({ n: undefined, text: '' })).toBe('');
  });

  it('keeps a zero: "0 events" is a fact, not an empty chip', () => {
    expect(chipHtml({ n: 0, text: 'events' })).toBe('<span class="tag"><b>0</b>events</span>');
  });

  it('adds a kind class for everything except plain', () => {
    expect(chipHtml({ text: 'x', kind: 'plain' })).not.toContain('tag--');
    expect(chipHtml({ text: 'x' })).not.toContain('tag--');
    for (const k of ['count', 'date', 'ok', 'warn', 'danger'] as const) {
      expect(chipHtml({ text: 'x', kind: k })).toContain(`class="tag tag--${k}"`);
    }
  });
});

describe('countChip', () => {
  it('shows a bare count when nothing is hidden', () => {
    expect(countChip(8).n).toBe('8');
    expect(countChip(8, 8).n).toBe('8');
    expect(countChip(8, 3).n).toBe('8'); // a total below the shown count is not a truncation
  });

  it('shows shown/total when the list is cut short', () => {
    expect(countChip(12, 40).n).toBe('12 / 40');
  });

  it('carries the unit and always counts', () => {
    const c = countChip(2, undefined, 'sessions');
    expect(c.text).toBe('sessions');
    expect(c.kind).toBe('count');
  });
});

describe('rangeChip', () => {
  it('prints both ends of a span', () => {
    expect(rangeChip('2026-09-25', '2026-09-28').n).toBe('2026-09-25 → 2026-09-28');
  });

  it('collapses a one-day span to a single date', () => {
    expect(rangeChip('2026-09-25', '2026-09-25').n).toBe('2026-09-25');
  });

  it('is a date, not a count', () => {
    expect(rangeChip('a', 'b').kind).toBe('date');
  });
});

describe('sectionHead', () => {
  it('wraps the label in the heading row', () => {
    const html = sectionHead('Rank history');
    expect(html).toContain('class="sec-head"');
    expect(html).toContain('class="section-title-row"');
    expect(html).toContain('<h3 class="section-title">Rank history</h3>');
  });

  it('treats the label as HTML — call sites pass emoji and muted asides', () => {
    expect(sectionHead('📈 Rank <span class="muted">history</span>'))
      .toContain('📈 Rank <span class="muted">history</span>');
  });

  it('places the chips inside the row, in order, skipping the empty ones', () => {
    const html = sectionHead('H', [countChip(2, undefined, 'sessions'), null,
      rangeChip('2026-09-25', '2026-09-28')]);
    expect(html.indexOf('sessions')).toBeLessThan(html.indexOf('2026-09-25'));
    expect(html).toContain('tag--count');
    expect(html).toContain('tag--date');
  });

  it('only emits the parts it was given', () => {
    const bare = sectionHead('H');
    expect(bare).not.toContain('sec-sub');
    expect(bare).not.toContain('--st-tone');
    expect(bare).not.toContain('sec-head-sp');
    expect(bare).not.toContain(' id=');

    const full = sectionHead('H', [], { sub: 'one line', tone: 'var(--danger)',
      right: '<button>+</button>', id: 'x' });
    expect(full).toContain('<p class="sec-sub">one line</p>');
    expect(full).toContain('style="--st-tone:var(--danger)"');
    expect(full).toContain('<span class="sec-head-sp"></span><button>+</button>');
    expect(full).toContain('id="x"');
  });

  it('keeps the sub outside the row, so the rule sits under the whole block', () => {
    const html = sectionHead('H', [], { sub: 'why' });
    expect(html.indexOf('</div>')).toBeLessThan(html.indexOf('sec-sub'));
  });
});
