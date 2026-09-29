/**
 * The playbook dialog's explanations, checked without a DOM.
 *
 * These tests exist because of how the explanations used to be wrong: they lived in
 * `title=` attributes written by hand next to each `<th>`, so a column could be
 * renamed, reordered or added and its explanation would stay behind, pointing at the
 * wrong box — and nothing would fail. Now one table emits the header, the cells AND
 * the legend, and these tests hold that table to the shape the renderer assumes.
 *
 * The other half checks the worked example. It is the only place in the app that
 * prints arithmetic as prose ("97.62 − 0.3% → 97.33"), and prose that disagrees with
 * the planner is worse than no prose: it would be believed. So every step is checked
 * against what `suggestLevels` actually returned.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP_RULES, SETUP_KEYS, type PlaybookRegime, type SetupRule } from '@screener/core';
import {
  DEMO_BARS, DEMO_CANDLES, DEMO_ENTRY, REGIME_DOC, REGIME_STATS, RULE_GROUPS,
  SETUP_COLUMNS, demoLevels, exampleSteps, exampleWarnings,
} from '../src/ui/playbookHelp.js';

/** Core has no runtime list of these, so the test spells them out. */
const REGIMES: readonly PlaybookRegime[] = ['UPTREND', 'UPTREND_UNDER_STRESS', 'RANGE', 'DOWNTREND'];

/** Everything on a `SetupRule` the dialog lets the user change. */
const EDITABLE: readonly (keyof SetupRule)[] = [
  'anchor', 'lookback', 'padPct', 'atrMult', 'maxStopEma', 'maxStopRef',
  'targetKind', 'firstTargetR', 'targetEma', 'trailEma', 'maxHoldSessions',
];

describe('SETUP_COLUMNS', () => {
  it('documents every editable field, exactly once', () => {
    const fields = SETUP_COLUMNS.map((c) => c.field);
    expect([...fields].sort()).toEqual([...EDITABLE].sort());
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('never documents a field that is not on a SetupRule', () => {
    // A column for a field core does not have would render an input whose edits go
    // nowhere: `readSetupBoxes` copies the defaults and only writes keys it finds.
    for (const c of SETUP_COLUMNS) {
      expect(Object.keys(DEFAULT_SETUP_RULES.VCP)).toContain(c.field);
    }
  });

  it('says what each number is AND what moving it does, in both languages', () => {
    for (const c of SETUP_COLUMNS) {
      for (const [k, v] of Object.entries(c)) {
        if (k === 'field' || k === 'group') continue;
        expect(v, `${c.field}.${k}`).toBeTruthy();
        // A one-word "explanation" is the failure mode being guarded against: the old
        // tooltips were short enough to be useless, which is why they were unread.
        if (k.startsWith('what') || k.startsWith('why')) {
          expect(String(v).length, `${c.field}.${k} too short`).toBeGreaterThan(30);
        }
      }
    }
  });

  it('groups its columns contiguously, in RULE_GROUPS order', () => {
    // The table header spans each group with one `colspan`, so a group whose columns are
    // not adjacent would put a header over the wrong boxes.
    const order = RULE_GROUPS.map((g) => g.key);
    const seen = SETUP_COLUMNS.map((c) => c.group).filter((g, i, a) => g !== a[i - 1]);
    expect(seen).toEqual(order);
  });

  it('has a group card for every group, with lead text and a colour', () => {
    for (const g of RULE_GROUPS) {
      expect(SETUP_COLUMNS.some((c) => c.group === g.key)).toBe(true);
      expect(g.vi && g.en && g.leadVi && g.leadEn).toBeTruthy();
      expect(g.color).toMatch(/^var\(--/);
    }
  });

  it('puts the stop columns before the target columns', () => {
    // Not cosmetic: the stop is what decides the share count, and a reader who meets
    // "First target R" before "Stop anchor" has met the answer before the question.
    const first = (g: string): number => SETUP_COLUMNS.findIndex((c) => c.group === g);
    expect(first('stop')).toBeLessThan(first('target'));
    expect(first('target')).toBeLessThan(first('manage'));
  });
});

describe('REGIME_DOC', () => {
  it('covers every regime the app can name', () => {
    for (const r of REGIMES) {
      const d = REGIME_DOC[r];
      expect(d, r).toBeTruthy();
      // `test*` is the measurement that produced the label and `size*` is what it costs;
      // a regime card without either is the muted run-on line this replaced.
      for (const k of ['vi', 'en', 'testVi', 'testEn', 'sizeVi', 'sizeEn'] as const) {
        expect(d[k], `${r}.${k}`).toBeTruthy();
      }
      expect(d.color).toMatch(/^var\(--/);
    }
  });

  it('describes exactly the five numbers the card prints', () => {
    // The renderer looks its values up by key; a sixth entry would print `undefined`
    // and a renamed one would print nothing at all.
    expect(REGIME_STATS.map((s) => s.key)).toEqual(['close', 'ma50', 'ma200', 'slope', 'atr']);
    for (const s of REGIME_STATS) expect(s.vi && s.en && s.noteVi && s.noteEn).toBeTruthy();
  });
});

describe('the demo chart', () => {
  it('is the same bars every render', () => {
    // Seeded, and frozen. A figure that reshuffles itself on each keystroke reads as a
    // live feed, and this one is emphatically not.
    expect(DEMO_BARS.length).toBe(40);
    expect(Object.isFrozen(DEMO_BARS)).toBe(true);
    expect(DEMO_BARS[0]!.close).toBe(78);
    expect(DEMO_BARS.at(-1)!.close).toBe(101.2);
  });

  it('is made of bars that could have happened', () => {
    let prev = '';
    for (const b of DEMO_BARS) {
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      expect(b.volume).toBeGreaterThan(0);
      expect(b.date > prev, `${b.date} after ${prev}`).toBe(true);
      prev = b.date;
    }
  });

  it('is bought above the signal bar, like the caption says', () => {
    // A buy-stop above the last bar's high — which is what the caption claims and what
    // makes every stop anchor sit below the entry. Inside the bar instead, and
    // `signalBarLow` would produce a stop above the entry with nothing to explain.
    const last = DEMO_BARS.at(-1)!;
    expect(DEMO_ENTRY).toBeGreaterThan(last.high);
    expect(DEMO_ENTRY).toBeGreaterThan(Math.max(...DEMO_BARS.slice(-10).map((b) => b.high)));
    expect(DEMO_CANDLES.length).toBe(DEMO_BARS.length);
  });

  it('keeps its stops in the range a reader should recognise', () => {
    // The reason the entry is 102 and not 104.5, asserted rather than left in a comment:
    // above the base's opening spike every setup returns `stopWiderThanAtr`, and a figure
    // where every row is a warning teaches the warning instead of the arithmetic.
    for (const k of SETUP_KEYS) {
      const lv = demoLevels(k, DEFAULT_SETUP_RULES[k])!;
      expect(lv.stopPct, `${k} stop %`).toBeGreaterThan(1.5);
      expect(lv.stopPct, `${k} stop %`).toBeLessThan(4.5);
      expect(lv.warnings, k).not.toContain('stopWiderThanAtr');
    }
  });
});

describe('exampleSteps', () => {
  it('lands on the stop and target suggestLevels actually returned', () => {
    for (const k of SETUP_KEYS) {
      const rule = DEFAULT_SETUP_RULES[k];
      const lv = demoLevels(k, rule);
      expect(lv, k).not.toBeNull();
      const steps = exampleSteps(rule, lv!, true, 2);
      const values = steps.map((s) => s.value);
      expect(values, `${k} stop`).toContain(lv!.stop.toFixed(2));
      if (lv!.target !== null) expect(values, `${k} target`).toContain(lv!.target.toFixed(2));
      // Every step is tinted like its column, so its group has to be one the legend
      // knows — plus 'result' for the two lines that are an outcome, not a setting.
      for (const s of steps) {
        expect(['stop', 'target', 'manage', 'result']).toContain(s.group);
        expect(s.label && s.detail && s.value, `${k}/${s.label}`).toBeTruthy();
        if (s.field !== null) expect(SETUP_COLUMNS.some((c) => c.field === s.field)).toBe(true);
      }
    }
  });

  it('works in both languages, and never leaks the other one', () => {
    const lv = demoLevels('VCP', DEFAULT_SETUP_RULES.VCP)!;
    const vi = exampleSteps(DEFAULT_SETUP_RULES.VCP, lv, true, 2);
    const en = exampleSteps(DEFAULT_SETUP_RULES.VCP, lv, false, 2);
    expect(vi.length).toBe(en.length);
    expect(vi.map((s) => s.label)).not.toEqual(en.map((s) => s.label));
    expect(vi.map((s) => s.value)).toEqual(en.map((s) => s.value));
  });

  it('explains a missing target rather than pretending there is one', () => {
    // Mean reversion targets the 20 EMA, and the demo entry is above it — a real
    // outcome, with a real warning, that the example has to be able to say out loud.
    const rule = DEFAULT_SETUP_RULES['Mean Reversion'];
    const lv = demoLevels('Mean Reversion', rule)!;
    if (lv.target === null) {
      expect(exampleWarnings(lv, true).join(' ')).toBeTruthy();
      expect(exampleSteps(rule, lv, true, 2).some((s) => s.group === 'target')).toBe(true);
    }
  });

  it('turns every warning into the same words the Buy form uses', () => {
    for (const k of SETUP_KEYS) {
      const lv = demoLevels(k, DEFAULT_SETUP_RULES[k])!;
      for (const lang of [true, false]) {
        const words = exampleWarnings(lv, lang);
        expect(words.length).toBe(lv.warnings.length);
        for (const w of words) expect(w.length).toBeGreaterThan(10);
      }
    }
  });

  it('follows the boxes: a wider pad moves the stop down', () => {
    // The point of the example is that it recomputes. If a change to a box did not move
    // a number, the figure would be decoration.
    const base: SetupRule = { ...DEFAULT_SETUP_RULES.Pullback, maxStopRef: 'off', padPct: 0.3 };
    const wide: SetupRule = { ...base, padPct: 3 };
    const a = demoLevels('Pullback', base)!;
    const b = demoLevels('Pullback', wide)!;
    expect(b.stop).toBeLessThan(a.stop);
    expect(exampleSteps(wide, b, true, 2).map((s) => s.value)).toContain(b.stop.toFixed(2));
  });
});
