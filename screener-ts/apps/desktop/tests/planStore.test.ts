/**
 * The one trade plan per symbol that the Trade Planner and the Buy form share.
 *
 * ── WHY THIS FILE EARNS ITS KEEP ────────────────────────────────────────────
 * Two of the things in `planStore` are load-bearing and silent when they break.
 *
 * The first is `reviewCurrent`. It is the whole soft gate: the acknowledgement checkbox has
 * no state of its own, it is a RENDERING of this function. If it returned true too
 * generously, the user could confirm a $100 entry with a $95 stop, retype the entry as $118,
 * and the Buy button would still be open with a green tick beside it — which is precisely
 * the trade the gate was added to slow down.
 *
 * The second is the read path. This blob syncs between devices and outlives the code that
 * wrote it, so a plan can arrive with fields missing, renamed, or of the wrong type. A
 * stringy `"false"` in `answers` is truthy, and would silently award the user points for a
 * criterion they never ticked — which raises their position size.
 */
import { describe, it, expect } from 'vitest';
import {
  deletePlan, emptyPlan, listPlans, loadPlan, loadStoredPlans, planKey, reviewCurrent, savePlan,
  type SymbolPlan,
} from '../src/portfolio/planStore.js';

function fakeCtx() {
  const store = new Map<string, unknown>();
  const ctx = {
    storage: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: unknown) => void store.set(k, v),
    },
  } as unknown as import('../src/context.js').AppContext;
  return { ctx, store };
}

describe('planKey', () => {
  it('normalises the symbol so one stock cannot have two plans', () => {
    // The ticker box is free text. ' nvda ' and 'NVDA' are the same stock, and two keys would
    // mean the checklist ticked in the planner never reaches the Buy form.
    expect(planKey(' nvda ')).toBe('plan:NVDA');
    expect(planKey('NVDA')).toBe(planKey('nvda'));
  });
});

describe('loadPlan', () => {
  it('returns an empty plan rather than null for a symbol with no plan', async () => {
    const { ctx } = fakeCtx();
    const p = await loadPlan(ctx, 'AMD');
    expect(p.symbol).toBe('AMD');
    expect(p.setup).toBe('');
    expect(p.answers).toEqual({});
    expect(p.reviewedAt).toBeNull();
  });

  it('round-trips everything the user can change', async () => {
    const { ctx } = fakeCtx();
    const saved = await savePlan(ctx, {
      ...emptyPlan('NVDA'),
      setup: 'VCP',
      answers: { sectorLeader: true, priorAdvance: false },
      gradeOverride: 'C',
      note: '<p>tight base</p>',
      noteEdited: true,
      reviewedAt: '2026-09-28T10:00:00.000Z',
      levels: { entry: 100, stop: 95, target: 130 },
      reviewedGrade: 'B',
    });
    expect(saved.updatedAt).toBeTruthy();
    const back = await loadPlan(ctx, 'nvda');
    expect(back.setup).toBe('VCP');
    expect(back.answers).toEqual({ sectorLeader: true, priorAdvance: false });
    expect(back.gradeOverride).toBe('C');
    expect(back.note).toBe('<p>tight base</p>');
    expect(back.noteEdited).toBe(true);
    expect(back.levels).toEqual({ entry: 100, stop: 95, target: 130 });
    expect(back.reviewedGrade).toBe('B');
  });

  it('drops answers that are not booleans', async () => {
    // A `"true"` string is truthy, so passing it through would award the criterion's weight
    // for an answer the user never gave — and the weight scales their position size.
    const { ctx, store } = fakeCtx();
    store.set('plan:NVDA', {
      symbol: 'NVDA',
      answers: { real: true, stringy: 'true', nully: null, numeric: 1 },
    });
    const p = await loadPlan(ctx, 'NVDA');
    expect(p.answers).toEqual({ real: true });
  });

  it('reads a plan written before `noteEdited` existed as the user’s own writing', async () => {
    // The safe direction: treating an old note as ours would let the next keystroke in the
    // price box regenerate over the user's reasoning, and there is no undo for that.
    const { ctx, store } = fakeCtx();
    store.set('plan:AMD', { symbol: 'AMD', note: '<p>my own words</p>' });
    expect((await loadPlan(ctx, 'AMD')).noteEdited).toBe(true);
    store.set('plan:TSLA', { symbol: 'TSLA' });
    expect((await loadPlan(ctx, 'TSLA')).noteEdited).toBe(false);
  });

  it('refuses levels that are not finite numbers', async () => {
    const { ctx, store } = fakeCtx();
    store.set('plan:AMD', { symbol: 'AMD', levels: { entry: 'x', stop: null, target: 130 } });
    const p = await loadPlan(ctx, 'AMD');
    expect(p.levels).toEqual({ entry: null, stop: null, target: 130 });
  });

  it('survives a storage that throws instead of answering', async () => {
    // The sync layer can fail. A plan panel that throws takes the whole Buy form's wiring
    // with it, and the user loses the ability to record a trade at all.
    const ctx = {
      storage: { get: async () => { throw new Error('offline'); }, set: async () => {} },
    } as unknown as import('../src/context.js').AppContext;
    await expect(loadPlan(ctx, 'NVDA')).resolves.toMatchObject({ symbol: 'NVDA', setup: '' });
  });
});

describe('the symbol index', () => {
  it('lists the plans that were saved, and forgets the ones deleted', async () => {
    const { ctx } = fakeCtx();
    await savePlan(ctx, { ...emptyPlan('NVDA'), setup: 'VCP' });
    await savePlan(ctx, { ...emptyPlan('AMD'), setup: 'EP' });
    expect((await listPlans(ctx)).map((p) => p.symbol)).toEqual(['AMD', 'NVDA']);
    await deletePlan(ctx, 'amd');
    expect((await listPlans(ctx)).map((p) => p.symbol)).toEqual(['NVDA']);
  });

  it('does not invent a plan for a symbol the index still lists', async () => {
    // The index is a hint. Another device can delete the plan and leave the name behind, and
    // showing an empty plan under it would claim the user's work still existed.
    const { ctx, store } = fakeCtx();
    await savePlan(ctx, { ...emptyPlan('NVDA'), setup: 'VCP' });
    store.set('plan:GHOST', null);
    store.set('plan_symbols', ['GHOST', 'NVDA']);
    expect((await listPlans(ctx)).map((p) => p.symbol)).toEqual(['NVDA']);
  });

  it('does not duplicate a symbol when the same plan is saved twice', async () => {
    const { ctx, store } = fakeCtx();
    await savePlan(ctx, emptyPlan('NVDA'));
    await savePlan(ctx, { ...emptyPlan('NVDA'), setup: 'EP' });
    expect(store.get('plan_symbols')).toEqual(['NVDA']);
  });
});

describe('loadStoredPlans', () => {
  it('returns only the symbols that have a plan, so the rest keep the scan’s suggestion', async () => {
    // The planner is the one caller that needs this distinction: a card with no stored plan
    // should show the setup the screener detected, and a card whose stored setup is empty
    // should stay empty because that is the user having cleared it.
    const { ctx } = fakeCtx();
    await savePlan(ctx, { ...emptyPlan('NVDA'), setup: 'VCP' });
    await savePlan(ctx, { ...emptyPlan('AMD'), setup: '' });
    const got = await loadStoredPlans(ctx, ['NVDA', 'AMD', 'TSLA']);
    expect([...got.keys()].sort()).toEqual(['AMD', 'NVDA']);
    expect(got.get('AMD')!.setup).toBe('');
    expect(got.has('TSLA')).toBe(false);
  });

  it('normalises and de-duplicates the symbols it is asked for', async () => {
    const { ctx } = fakeCtx();
    await savePlan(ctx, { ...emptyPlan('NVDA'), setup: 'VCP' });
    const got = await loadStoredPlans(ctx, [' nvda ', 'NVDA', '']);
    expect([...got.keys()]).toEqual(['NVDA']);
  });

  it('returns what it could read when one symbol’s read fails', async () => {
    // One unreadable key must not blank every other card on the screen.
    const store = new Map<string, unknown>([['plan:NVDA', { symbol: 'NVDA', setup: 'VCP' }]]);
    const ctx = {
      storage: {
        get: async (k: string) => {
          if (k === 'plan:AMD') throw new Error('offline');
          return store.get(k) ?? null;
        },
        set: async () => {},
      },
    } as unknown as import('../src/context.js').AppContext;
    const got = await loadStoredPlans(ctx, ['NVDA', 'AMD']);
    expect([...got.keys()]).toEqual(['NVDA']);
  });
});

describe('reviewCurrent — the soft gate’s memory', () => {
  const acked = (over: Partial<SymbolPlan> = {}): SymbolPlan => ({
    ...emptyPlan('NVDA'),
    setup: 'VCP',
    reviewedAt: '2026-09-28T10:00:00.000Z',
    levels: { entry: 100, stop: 95, target: 130 },
    reviewedGrade: 'B',
    ...over,
  });
  const now = { entry: 100, stop: 95, target: 130 };

  it('holds when nothing has moved', () => {
    expect(reviewCurrent(acked(), 'VCP', now, 'B')).toBe(true);
  });

  it('is false when the plan was never acknowledged', () => {
    expect(reviewCurrent(acked({ reviewedAt: null }), 'VCP', now, 'B')).toBe(false);
    // A timestamp with no levels beside it cannot be checked against anything, so it does
    // not count — this is what a plan from a version before `levels` looks like.
    expect(reviewCurrent(acked({ levels: null }), 'VCP', now, 'B')).toBe(false);
  });

  it('expires when the setup changes', () => {
    // A different playbook row is a different stop, a different target and a different
    // checklist. The tick was about the other trade.
    expect(reviewCurrent(acked(), 'EP', now, 'B')).toBe(false);
    expect(reviewCurrent(acked(), '', now, 'B')).toBe(false);
  });

  it('expires when the grade changes under the tick', () => {
    // How that happens without the setup or the levels moving: answering one more criterion,
    // or picking an override. The box would otherwise stay ticked beside a D — a quarter of
    // the position size — having been ticked against a B.
    expect(reviewCurrent(acked(), 'VCP', now, 'D')).toBe(false);
    expect(reviewCurrent(acked(), 'VCP', now, null)).toBe(false);
    // And an acknowledgement of an ungraded plan holds only while it stays ungraded.
    expect(reviewCurrent(acked({ reviewedGrade: null }), 'VCP', now, null)).toBe(true);
    expect(reviewCurrent(acked({ reviewedGrade: null }), 'VCP', now, 'A')).toBe(false);
  });

  it('expires when the entry moves enough to be a different trade', () => {
    expect(reviewCurrent(acked(), 'VCP', { ...now, entry: 118 }, 'B')).toBe(false);
  });

  it('survives a close that ticked a cent', () => {
    // The price box is re-filled from the latest close on every redraw. If a one-cent move
    // un-ticked the box, the gate would be unsatisfiable during market hours.
    expect(reviewCurrent(acked(), 'VCP', { ...now, entry: 100.01 }, 'B')).toBe(true);
    expect(reviewCurrent(acked(), 'VCP', { ...now, entry: 100.4 }, 'B')).toBe(true);
    expect(reviewCurrent(acked(), 'VCP', { ...now, entry: 101.5 }, 'B')).toBe(false);
  });

  it('keeps the tolerance meaningful at both ends of the price range', () => {
    // A tolerance in percent alone is nothing on a $2 stock; a tolerance in cents alone is
    // nothing on a $900 one. Hence "a cent or 0.5%, whichever is larger".
    const penny = acked({ levels: { entry: 2, stop: 1.9, target: 2.6 } });
    expect(reviewCurrent(penny, 'VCP', { entry: 2.005, stop: 1.9, target: 2.6 }, 'B')).toBe(true);
    expect(reviewCurrent(penny, 'VCP', { entry: 2.2, stop: 1.9, target: 2.6 }, 'B')).toBe(false);
    const dear = acked({ levels: { entry: 900, stop: 850, target: 1100 } });
    expect(reviewCurrent(dear, 'VCP', { entry: 902, stop: 850, target: 1100 }, 'B')).toBe(true);
    expect(reviewCurrent(dear, 'VCP', { entry: 940, stop: 850, target: 1100 }, 'B')).toBe(false);
  });

  it('expires the moment the stop or the target is retyped', () => {
    // These only move when something decided they should, so they are compared exactly. A
    // widened stop is a bigger loss than the one that was confirmed.
    expect(reviewCurrent(acked(), 'VCP', { ...now, stop: 90 }, 'B')).toBe(false);
    expect(reviewCurrent(acked(), 'VCP', { ...now, target: 140 }, 'B')).toBe(false);
    expect(reviewCurrent(acked(), 'VCP', { ...now, target: null }, 'B')).toBe(false);
  });

  it('re-asks rather than trusting a tick from before the grade was recorded', () => {
    // A plan written by an older version has no `reviewedGrade`, so there is no way to know
    // which letter was agreed to. Expiring is the safe direction: the cost is one more click.
    const old = acked({ reviewedGrade: null });
    expect(reviewCurrent(old, 'VCP', now, 'B')).toBe(false);
  });
});
