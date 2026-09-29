/**
 * The exit-reason vocabulary — the shipped rows, and the part the user writes.
 *
 * ── WHY THIS FILE EARNS ITS KEEP ────────────────────────────────────────────
 * Everything here decides what a KEY means, and a key is what gets written onto a case study or a
 * sell and then read back months later to answer "how did I do on the trades I sold out of fear".
 * The four ways that can go wrong are all silent:
 *
 *   1. A custom row shadowing a shipped one. `stop` already sits on old records; letting a
 *      user-typed row take that key would rename what a year of history says happened.
 *   2. Two keys for one label. Re-typing a reason must return the same key, or the aggregate the
 *      list exists for splits in half and neither part is countable.
 *   3. A missing key rendering as blank. A reason the user deleted last month must not erase
 *      itself from a trade filed under it in January.
 *   4. The reverse lookup. The Case Studies editor stores a SENTENCE; if the sentence cannot be
 *      matched back to a key, everything filed from that tab is uncountable.
 *
 * Every function tested here takes its list as an argument, so none of this touches storage.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXIT_REASONS,
  EXIT_GROUPS,
  asExitGroup,
  exitReasonFieldOptions,
  exitReasonKeyFor,
  exitReasonKeyOfText,
  exitReasonLabel,
  exitReasonOptgroupsHtml,
  exitReasonsFrom,
  type CustomExitReason,
} from '../src/portfolio/exitReasons.js';

/** The same escaper the planner passes in — see `esc` in `portfolio/tradePlanner.ts`. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

describe('the shipped vocabulary', () => {
  it('spells every key once', () => {
    const keys = DEFAULT_EXIT_REASONS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the keys old records already point at', () => {
    // These nine shipped in the first version of the exit feature and are stored on filed case
    // studies. Renaming one is the edit that looks like a tidy-up and reads like data loss.
    for (const k of ['stop', 'target', 'trail', 'time', 'thesis', 'market', 'better', 'scaled', 'panic', 'other']) {
      expect(DEFAULT_EXIT_REASONS.some((r) => r.key === k)).toBe(true);
    }
  });

  it('puts every row in a group the UI knows how to head', () => {
    const groups = new Set(EXIT_GROUPS.map((g) => g.key));
    for (const r of DEFAULT_EXIT_REASONS) expect(groups.has(r.group)).toBe(true);
  });

  it('says something in both languages for every row', () => {
    for (const r of DEFAULT_EXIT_REASONS) {
      expect(r.en.trim()).not.toBe('');
      expect(r.vi.trim()).not.toBe('');
    }
  });

  it('covers what the user asked for by name', () => {
    const wanted = ['ema10', 'ema21', 'revcandle', 'engulf', 'shooting', 'evening', 'hanging', 'climax'];
    for (const k of wanted) expect(DEFAULT_EXIT_REASONS.some((r) => r.key === k)).toBe(true);
  });
});

describe('exitReasonsFrom', () => {
  const mine = (p: Partial<CustomExitReason>): CustomExitReason =>
    ({ key: 'my:x', label: 'Sold too early', group: 'mine', ...p });

  it('adds the user’s rows to the shipped ones', () => {
    const list = exitReasonsFrom([mine({ key: 'my:early', label: 'Sold too early' })]);
    expect(list).toHaveLength(DEFAULT_EXIT_REASONS.length + 1);
    const row = list.find((r) => r.key === 'my:early')!;
    // One label, used for both languages: asking somebody to translate their own note before it
    // can be saved is how a feature stops being used.
    expect(row.en).toBe('Sold too early');
    expect(row.vi).toBe('Sold too early');
    expect(row.builtin).toBe(false);
  });

  it('marks the shipped rows read-only so the editor cannot offer to delete them', () => {
    expect(exitReasonsFrom([]).every((r) => r.builtin)).toBe(true);
  });

  it('drops a custom row that would shadow a shipped key', () => {
    const list = exitReasonsFrom([{ key: 'stop', label: 'My own meaning of stop', group: 'mine' }]);
    expect(list).toHaveLength(DEFAULT_EXIT_REASONS.length);
    expect(exitReasonLabel('stop', false, list)).toBe('Stop hit');
  });

  it('drops a row with no key and a row with no label', () => {
    const list = exitReasonsFrom([
      { key: '', label: 'Nameless', group: 'mine' },
      { key: 'my:blank', label: '   ', group: 'mine' },
    ]);
    expect(list).toHaveLength(DEFAULT_EXIT_REASONS.length);
  });

  it('keeps the first of two rows sharing a key', () => {
    const list = exitReasonsFrom([
      mine({ key: 'my:dupe', label: 'First' }),
      mine({ key: 'my:dupe', label: 'Second' }),
    ]);
    expect(list.filter((r) => r.key === 'my:dupe')).toHaveLength(1);
    expect(exitReasonLabel('my:dupe', false, list)).toBe('First');
  });

  it('orders by group so the dropdown reads top to bottom', () => {
    const list = exitReasonsFrom([mine({ key: 'my:early', label: 'Sold too early' })]);
    const order = EXIT_GROUPS.map((g) => g.key);
    const seen = list.map((r) => order.indexOf(r.group));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('files a row with an unrecognisable group under the user’s own', () => {
    // Reachable from a hand-edited or newer synced blob. 'mine' rather than dropped: the row is
    // the user's writing, and a group name is not worth losing it over.
    const list = exitReasonsFrom([
      { key: 'my:odd', label: 'Odd one', group: asExitGroup('nonsense') },
    ]);
    expect(list.find((r) => r.key === 'my:odd')!.group).toBe('mine');
  });
});

describe('exitReasonKeyFor', () => {
  it('slugs the label under the prefix that cannot collide with a shipped key', () => {
    expect(exitReasonKeyFor('Sold too early', [])).toBe('my:sold-too-early');
  });

  it('strips Vietnamese diacritics rather than dropping the words', () => {
    // The key is stored, so it has to be ASCII-safe; the LABEL keeps the accents.
    expect(exitReasonKeyFor('Bán vì sợ', [])).toBe('my:ban-vi-so');
  });

  it('never returns a bare prefix for a label with nothing sluggable in it', () => {
    expect(exitReasonKeyFor('???', [])).toBe('my:reason');
  });

  it('suffixes only on a real collision', () => {
    expect(exitReasonKeyFor('Sold too early', ['my:sold-too-early'])).toBe('my:sold-too-early-2');
    expect(exitReasonKeyFor('Sold too early', ['my:sold-too-early', 'my:sold-too-early-2']))
      .toBe('my:sold-too-early-3');
  });

  it('keeps the key short enough to read in the stored blob', () => {
    const key = exitReasonKeyFor('a'.repeat(200), []);
    expect(key.length).toBeLessThanOrEqual('my:'.length + 32);
  });
});

describe('exitReasonLabel', () => {
  const list = exitReasonsFrom([{ key: 'my:early', label: 'Sold too early', group: 'mine' }]);

  it('speaks both languages', () => {
    expect(exitReasonLabel('panic', false, list)).toBe('Sold out of fear — not the plan');
    expect(exitReasonLabel('panic', true, list)).toBe('Bán vì sợ — không theo kế hoạch');
  });

  it('gives the user’s own row back in either language', () => {
    expect(exitReasonLabel('my:early', false, list)).toBe('Sold too early');
    expect(exitReasonLabel('my:early', true, list)).toBe('Sold too early');
  });

  it('returns the raw key for a reason no longer on the list', () => {
    // A deleted reason must not erase itself from the trade it was filed on. `my:gone` on screen
    // is an ugly record; a blank is a lost one.
    expect(exitReasonLabel('my:gone', false, list)).toBe('my:gone');
  });

  it('says nothing for no reason at all', () => {
    expect(exitReasonLabel('', false, list)).toBe('');
  });
});

describe('exitReasonKeyOfText', () => {
  const list = exitReasonsFrom([{ key: 'my:early', label: 'Sold too early', group: 'mine' }]);

  it('matches a label the user picked out of the datalist', () => {
    expect(exitReasonKeyOfText('Stop hit', list)).toBe('stop');
    expect(exitReasonKeyOfText('Chạm cắt lỗ', list)).toBe('stop');
  });

  it('matches the label half of what the planner writes', () => {
    // `exitReasonText` files "Stop hit — gapped straight through it".
    expect(exitReasonKeyOfText('Stop hit — gapped straight through it', list)).toBe('stop');
  });

  it('matches across languages, because a record can be edited in the other one', () => {
    expect(exitReasonKeyOfText('bán vì sợ — không theo kế hoạch', list)).toBe('panic');
  });

  it('matches the user’s own rows too', () => {
    expect(exitReasonKeyOfText('sold too early', list)).toBe('my:early');
  });

  it('has no key for a sentence the user simply wrote', () => {
    expect(exitReasonKeyOfText('I got bored and wanted the cash back', list)).toBe(undefined);
    expect(exitReasonKeyOfText('   ', list)).toBe(undefined);
  });
});

describe('the rendered options', () => {
  const list = exitReasonsFrom([{ key: 'my:early', label: 'Sold <too> "early"', group: 'mine' }]);

  it('groups the select and marks the chosen row', () => {
    const html = exitReasonOptgroupsHtml('ema21', false, esc, list);
    expect(html).toContain('<optgroup label="Moving averages">');
    expect(html).toContain('<option value="ema21" selected>');
    // One optgroup per non-empty group, and no empty ones.
    expect((html.match(/<optgroup/g) ?? []).length).toBe(
      EXIT_GROUPS.filter((g) => list.some((r) => r.group === g.key)).length,
    );
  });

  it('escapes a label the user typed', () => {
    const html = exitReasonOptgroupsHtml('', false, esc, list);
    expect(html).toContain('Sold &lt;too&gt; &quot;early&quot;');
    expect(html).not.toContain('<too>');
  });

  it('gives formDialog a flat list that starts with the way out', () => {
    const opts = exitReasonFieldOptions(false, '— pick a reason');
    expect(opts[0]).toEqual({ value: '', label: '— pick a reason' });
    // Every reason carries its group name, which is what `formDialog` wraps in an <optgroup>.
    expect(opts.slice(1).every((o) => !!o.group)).toBe(true);
    // And nothing is offered twice — a duplicate here would be a second countable key on screen.
    const values = opts.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
