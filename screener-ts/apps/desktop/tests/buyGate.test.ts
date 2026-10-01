/**
 * When exactly the Buy button unlocks.
 *
 * ── WHY THIS IS THE ONE PART THAT MUST NOT BE CHECKED BY EYE ─────────────────
 * The app's vitest has no DOM, so almost all of the Buy form is verified by looking at it.
 * The gate is the exception, because both of its failure modes are invisible to looking.
 *
 * Fail open and the feature silently isn't there: the user buys without reading the plan and
 * nothing on screen says the gate was meant to stop them. Fail shut and the Buy button is
 * dead for a case nobody tried by hand — recording a trade with no playbook row, for
 * instance — and the portfolio stops being a record of what was actually done, which is
 * worse than a badly graded lot in it.
 */
import { describe, it, expect } from 'vitest';
import { ackLabel, buyGate, gateWords, type GateInput } from '../src/portfolio/buyGate.js';

const ready: GateInput = { hasFields: true, planning: false, graded: true, acknowledged: true };

describe('buyGate', () => {
  it('opens once the fields are in, the plan is graded and it has been acknowledged', () => {
    expect(buyGate(ready)).toBeNull();
  });

  it('holds shut until the plan is acknowledged', () => {
    expect(buyGate({ ...ready, acknowledged: false })).toBe('ack');
  });

  it('holds shut while the evaluation is still running', () => {
    // A tick made against a half-built plan is the one thing the gate exists to prevent, so
    // this beats the acknowledgement even when the box is already ticked.
    expect(buyGate({ ...ready, planning: true })).toBe('planning');
    expect(buyGate({ ...ready, planning: true, acknowledged: false })).toBe('planning');
  });

  it('complains about the empty form before it complains about the plan', () => {
    // Nagging about an unread plan while the share count box is still empty teaches the user
    // to ignore the message, and then the real one goes unread too.
    expect(buyGate({ hasFields: false, planning: true, graded: false, acknowledged: false }))
      .toBe('fields');
  });

  it('still opens for a trade that was never graded, once acknowledged', () => {
    // This form is how a trade gets RECORDED — including one taken months ago, or for a
    // reason the playbook has no row for. A gate that could not be opened without a grade
    // would push the user to stop booking trades, and the portfolio would go wrong.
    expect(buyGate({ ...ready, graded: false })).toBeNull();
  });

  it('still opens for a deliberate D — the gate confirms reading, not quality', () => {
    // The user chose a soft gate over a hard one. Nothing in the input mentions the letter,
    // and that is the design: this test fails if a quality check is ever smuggled in here.
    expect(buyGate(ready)).toBeNull();
    expect(Object.keys(ready)).not.toContain('grade');
  });
});

describe('ackLabel', () => {
  it('says what is being confirmed, including the letter', () => {
    // A tick reading "I have read this plan — grade D" is a weaker thing to click than a bare
    // "I have read this plan", and that friction is the entire point of the box.
    expect(ackLabel(true, 'D', false)).toContain('grade D');
    expect(ackLabel(true, 'D', true)).toContain('hạng D');
    expect(ackLabel(true, 'A', false)).toContain('grade A');
  });

  it('does not claim a plan was read when there was no plan', () => {
    const en = ackLabel(false, null, false);
    expect(en).not.toMatch(/read this plan/i);
    expect(en).toMatch(/no graded plan/i);
    expect(ackLabel(false, null, true)).toMatch(/không có kế hoạch/i);
  });

  it('omits the letter when the score could not name one', () => {
    // An ungraded-but-scored plan (too little evidence to pick a letter) must not print
    // "grade null" or "grade —" as if that were a verdict.
    expect(ackLabel(true, null, false)).toBe('I have read this plan');
    expect(ackLabel(true, null, true)).toBe('Tôi đã xem kế hoạch này');
  });
});

describe('gateWords', () => {
  it('says nothing when nothing is blocking', () => {
    expect(gateWords(null, true, false)).toBe('');
    expect(gateWords(null, true, true)).toBe('');
  });

  it('gives every block a line in both languages', () => {
    for (const b of ['fields', 'planning', 'ack'] as const) {
      for (const graded of [true, false]) {
        expect(gateWords(b, graded, false), `${b}/${graded}/en`).not.toBe('');
        expect(gateWords(b, graded, true), `${b}/${graded}/vi`).not.toBe('');
        expect(gateWords(b, graded, false), `${b}/${graded}`)
          .not.toBe(gateWords(b, graded, true));
      }
    }
  });

  it('tells an ungraded user how to get a grade, not just to tick the box', () => {
    // With no Setup chosen there is nothing to read, so "read the plan above" would point at
    // an empty panel. The line has to name the field that would produce one.
    expect(gateWords('ack', false, false)).toMatch(/Setup/);
    expect(gateWords('ack', false, true)).toMatch(/Loại setup/);
    expect(gateWords('ack', true, false)).toMatch(/plan above/i);
  });

  it('survives having its markup stripped for a button tooltip', () => {
    // The same string is used as the button's `title`, where tags would show up literally.
    const plain = gateWords('ack', false, false).replace(/<[^>]*>/g, '');
    expect(plain).not.toContain('<');
    expect(plain).toContain('Setup');
  });
});
