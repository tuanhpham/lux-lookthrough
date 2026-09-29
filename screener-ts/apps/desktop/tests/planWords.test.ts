/**
 * The shared explanation — the half of the plan the user actually reads.
 *
 * Core returns CODES (`'contractionLow'`, `'heatExceeded'`, `'rating'`) and this module
 * turns them into sentences. The failure that matters is not a clumsy phrase, it is a
 * code with no entry in the table: the line then renders as `undefined` or vanishes,
 * and the screen shows a share count with the reason for it missing. So most of what is
 * checked here is coverage rather than wording.
 */
import { describe, it, expect, vi } from 'vitest';
import { SETUP_KEYS, createAccount, type AccountState, type Bar } from '@screener/core';

const id = (() => {
  let n = 0;
  return () => `pw${++n}`;
})();

function bar(date: string, close: number, low: number, high: number): Bar {
  return { date, open: close, high, low, close, volume: 1_000_000 };
}

function isoDate(i: number): string {
  const d = new Date(Date.UTC(2025, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

/** 120 sessions rising gently, so every setup finds a low below the entry to anchor on. */
const BARS: Bar[] = Array.from({ length: 120 }, (_, i) => {
  const c = 60 + i * 0.3;
  return bar(isoDate(i), c, c * 0.94, c * 1.02);
});

const SPY: Bar[] = Array.from({ length: 320 }, (_, i) => {
  const c = 100 + i * 0.5;
  return bar(isoDate(i), c, c * 0.995, c * 1.005);
});

async function load() {
  vi.resetModules();
  const store = new Map<string, unknown>();
  const ctx = {
    storage: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: unknown) => void store.set(k, v),
    },
    data: { getOHLCV: async () => ({ bars: SPY }) },
  } as unknown as import('../src/context.js').AppContext;

  const fx = await import('../src/portfolio/fx.js');
  fx.applyEurUsdBars([bar('2026-09-25', 1.25, 1.25, 1.25)]);
  const pb = await import('../src/portfolio/playbook.js');
  const words = await import('../src/portfolio/planWords.js');
  await pb.ensureRegime(ctx, { refresh: true });
  return { ctx, pb, words };
}

function account(): AccountState {
  return createAccount(
    { name: 'TA', initialCapital: 100_000, currency: 'USD', createdAt: '2026-01-02' },
    id,
  );
}

const OPTS = { vi: false, levelSym: '$', moneySym: '$', money: true };

describe('planLines', () => {
  it('words every setup’s stop anchor', async () => {
    // A new `StopAnchor` in core with no `ANCHOR_MEANS` entry would print `undefined`
    // right next to the stop price — the one number on the card that must not look
    // like a bug.
    const { pb, words } = await load();
    for (const setup of SETUP_KEYS) {
      const plan = pb.buildBuyPlan({
        state: account(), prices: {}, bars: BARS,
        entry: 95, entryCurrency: 'USD', setup, date: '2026-09-25',
      });
      if (!plan) continue; // no stop below the entry is a legitimate answer
      const text = words.planLines(plan, OPTS).join('\n');
      expect(text, setup).not.toContain('undefined');
      expect(text, setup).not.toContain('NaN');
    }
  });

  it('leads with the numbers the user is about to trade, one fact per row', async () => {
    const { pb, words } = await load();
    const plan = pb.buildBuyPlan({
      state: account(), prices: {}, bars: BARS,
      entry: 95, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25',
    })!;
    const rows = words.planRows(plan, OPTS);
    // A reader who stops after three rows has still read the stop, the target and the size.
    // They used to be two rows — stop-and-target on one line, shares-and-risk on the next —
    // which is how the four numbers a trade is made of ended up mid-paragraph.
    expect(rows[0]!.k).toBe('Stop');
    expect(rows[0]!.v).toContain(String(plan.stop));
    expect(rows[1]!.k).toBe('Target');
    expect(rows[2]!.k).toBe('Shares');
    expect(rows[2]!.v).toContain(`<b>${plan.shares}</b>`);
    // Every row carries a label except the warnings, which are sentences and do not need one.
    for (const r of rows) expect(r.k === '' ? r.v : r.k, r.v).toBeTruthy();
  });

  it('gives the note a heading and a list, because a stored note cannot hold a table', async () => {
    /*
     * The user's "phan note … nen duoc structured dep hon (table hay mot gi do that dep)". The
     * honest answer is not a table: `sanitizeNoteHtml` keeps a small subset of tags, `TABLE` is
     * not in it, and this HTML is STORED in an editable note rather than rendered. A table would
     * arrive with its grid unwrapped — worse than the paragraph it replaced.
     */
    const { pb, words } = await load();
    const plan = pb.buildBuyPlan({
      state: account(), prices: {}, bars: BARS,
      entry: 95, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25', rating: 'B',
    })!;
    const html = words.planNoteHtml(plan, OPTS);
    expect(html).toMatch(/^<h3>/);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><b>Stop</b>');
    expect(html).not.toContain('<table');
    // One <li> per row, so nothing is lost on the way into the note.
    expect(html.match(/<li>/g)).toHaveLength(words.planRows(plan, OPTS).length);
    // Muted detail carries an INLINE colour as well as the class: the class is what the app's
    // stylesheet knows and the style is what survives the sanitizer, and the note needs both.
    expect(html).toContain('color:var(--subtext');
  });

  it('shows the grade’s subtraction, not just its answer', async () => {
    // The complaint that produced this line: the grade dropdown moved and the share
    // count did not, and there was no way to tell from the card whether it had worked.
    // So the wording prints BOTH counts and the percentage between them.
    const { pb, words } = await load();
    const plan = (rating: 'C' | null) => pb.buildBuyPlan({
      state: account(), prices: {}, bars: BARS,
      entry: 95, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25', rating,
    })!;
    const of = (rating: 'C' | null) => words.planLines(plan(rating), OPTS).join('\n');

    const c = plan('C');
    const graded = of('C');
    expect(graded).toContain('Grade');
    expect(graded).toContain(words.RATING_MEANS.C![1]);
    expect(graded).toContain('full size');
    expect(graded).toContain(String(c.size.fullShares));
    expect(graded).toContain('50%');
    expect(c.shares).toBeLessThan(c.size.fullShares);

    // An ungraded trade says nothing about a grade, because there is nothing to say.
    expect(of(null)).not.toContain('Grade');
  });

  it('speaks both languages', async () => {
    const { pb, words } = await load();
    const plan = pb.buildBuyPlan({
      state: account(), prices: {}, bars: BARS,
      entry: 95, entryCurrency: 'USD', setup: 'VCP', date: '2026-09-25', rating: 'B',
    })!;
    const en = words.planLines(plan, OPTS).join('\n');
    const viText = words.planLines(plan, { ...OPTS, vi: true }).join('\n');
    expect(en).toContain('Stop');
    expect(viText).toContain('Cắt lỗ');
    expect(viText).not.toContain('undefined');
    // Same number of lines either way: a translation that dropped a warning would hide
    // it from exactly the reader who needs it most.
    expect(words.planLines(plan, { ...OPTS, vi: true })).toHaveLength(words.planLines(plan, OPTS).length);
  });

  it('has a phrase for every cut the budget can report', async () => {
    // Mirrors `RiskCut` in core. There is no runtime list of the codes, so this is the
    // reminder to add the words when a new cut is added to the ladder.
    const { words } = await load();
    for (const cut of [
      'regimeDowntrend', 'volExpanded', 'regimeStress', 'regimeRange',
      'losingStreak', 'flooredAtMin',
    ]) {
      expect(words.CUT_SHORT[cut], cut).toBeDefined();
    }
    // And `rating` is deliberately NOT one of them any more: the grade scales the
    // finished position rather than the risk budget, so listing it among the ladder's
    // penalties would read as the app refusing size the user chose to give up.
    expect(words.CUT_SHORT.rating).toBeUndefined();
  });

  it('labels the money and the levels separately', async () => {
    // The planner shows USD levels next to account-currency money. One symbol for both
    // would misprice the risk by the EURUSD rate on screen while the arithmetic was right.
    const { pb, words } = await load();
    const plan = pb.buildBuyPlan({
      state: account(), prices: {}, bars: BARS,
      entry: 95, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25',
    })!;
    const text = words.planLines(plan, { vi: false, levelSym: '$', moneySym: '€', money: true }).join('\n');
    expect(text).toContain(`$${plan.stop}`);
    expect(text).toContain('€');
  });

  it('names every setup in both languages', async () => {
    const { words } = await load();
    for (const k of SETUP_KEYS) {
      expect(words.setupName(k, true), k).toBeTruthy();
      expect(words.setupName(k, false), k).toBeTruthy();
    }
  });
});
