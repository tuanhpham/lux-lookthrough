/**
 * The plan a lot was bought on, frozen.
 *
 * ── WHY THIS FILE EARNS ITS KEEP ────────────────────────────────────────────
 * This is the only data in the app whose whole value is that it does not change. Everything
 * else can be recomputed, re-fetched or re-entered; a snapshot that silently reflects today's
 * plan instead of the one the trade was made on is worse than no snapshot at all, because the
 * document looks exactly as authoritative either way. So the round-trip is tested, and so is
 * the read path — this blob syncs between devices and is by construction the oldest data here,
 * written by a version of the code that may no longer exist.
 *
 * The read path's two sharp edges: a `grade` whose `outcomes` did not survive (the report walks
 * that array, so on screen the button would simply do nothing), and `answers` that are not
 * booleans (a stringy `"false"` is truthy and would award a criterion the user never ticked —
 * inside a record of a decision already taken, where nobody will ever check).
 */
import { describe, it, expect } from 'vitest';
import type { GradeResult } from '@screener/core';
import {
  deletePlanSnapshot, loadPlanSnapshot, lotIdsWithPlan, planSnapshotKey, savePlanSnapshot,
  type PlanSnapshot,
} from '../src/portfolio/planSnapshot.js';
import { emptyPlan } from '../src/portfolio/planStore.js';

function fakeCtx() {
  const store = new Map<string, unknown>();
  const ctx = {
    storage: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: unknown) => void store.set(k, v),
      list: async (prefix = '') => [...store.keys()].filter((k) => k.startsWith(prefix)),
      delete: async (k: string) => void store.delete(k),
    },
  } as unknown as import('../src/context.js').AppContext;
  return { ctx, store };
}

const GRADE: GradeResult = {
  grade: 'B',
  score: 74,
  outcomes: [
    { key: 'sectorLeader', group: 'trend', weight: 6, met: true, known: true, source: 'manual', measured: null },
  ],
} as unknown as GradeResult;

const SNAP: PlanSnapshot = {
  lotId: 'lot-1',
  symbol: 'NVDA',
  savedAt: '2026-09-28T10:00:00.000Z',
  date: '2026-09-25',
  plan: {
    ...emptyPlan('NVDA'),
    setup: 'VCP',
    answers: { sectorLeader: true, priorAdvance: false },
    note: '<p>tight base</p>',
    noteEdited: true,
    reviewedAt: '2026-09-25T09:00:00.000Z',
    levels: { entry: 100, stop: 95, target: 130 },
    reviewedGrade: 'B',
  },
  grade: GRADE,
  effective: 'B',
  levels: { entry: 100, stop: 95, target: 130 },
  shares: 40,
  currency: 'USD',
  pctOfFull: 75,
};

describe('planSnapshotKey', () => {
  it('keys on the lot id, so nothing has to be added to the lot itself', () => {
    // The point of the prefix: `lotIdsWithPlan` can list it, and the accounts row — one blob
    // that syncs whole and has been 912 KB — does not grow by a checklist per trade.
    expect(planSnapshotKey('lot-1')).toBe('plansnap:lot-1');
  });
});

describe('savePlanSnapshot / loadPlanSnapshot', () => {
  it('round-trips everything the report prints', async () => {
    const { ctx } = fakeCtx();
    await savePlanSnapshot(ctx, SNAP);
    const back = await loadPlanSnapshot(ctx, 'lot-1');
    expect(back).not.toBeNull();
    expect(back!.symbol).toBe('NVDA');
    expect(back!.date).toBe('2026-09-25');
    expect(back!.plan.setup).toBe('VCP');
    expect(back!.plan.answers).toEqual({ sectorLeader: true, priorAdvance: false });
    expect(back!.plan.note).toBe('<p>tight base</p>');
    expect(back!.plan.reviewedAt).toBe('2026-09-25T09:00:00.000Z');
    expect(back!.grade!.score).toBe(74);
    expect(back!.effective).toBe('B');
    expect(back!.levels).toEqual({ entry: 100, stop: 95, target: 130 });
    expect(back!.shares).toBe(40);
    expect(back!.currency).toBe('USD');
    // Stored rather than recomputed: the user can edit the ladder, and recomputing would
    // restate an old trade as if today's rules had applied to it.
    expect(back!.pctOfFull).toBe(75);
  });

  it('is null for a lot with no plan, and for no lot at all', async () => {
    // What makes the row button honest: it is unhidden only where this returns something.
    const { ctx } = fakeCtx();
    expect(await loadPlanSnapshot(ctx, 'lot-missing')).toBeNull();
    expect(await loadPlanSnapshot(ctx, '')).toBeNull();
  });

  it('writes nothing for a lot with no id', async () => {
    // A snapshot under `plansnap:` would be unreachable and never collected.
    const { ctx, store } = fakeCtx();
    await savePlanSnapshot(ctx, { ...SNAP, lotId: '' });
    expect(store.size).toBe(0);
  });

  it('survives a storage that throws instead of answering', async () => {
    const ctx = {
      storage: { get: async () => { throw new Error('offline'); } },
    } as unknown as import('../src/context.js').AppContext;
    expect(await loadPlanSnapshot(ctx, 'lot-1')).toBeNull();
  });

  it('drops a grade that cannot be shown', async () => {
    // The report walks `grade.outcomes` under the heading "Scorecard". A letter with nothing
    // behind it is not a grade with a gap — printing it would be the document making a claim
    // it cannot show, and rendering it would throw, which on screen is a button that does
    // nothing at all.
    const { ctx, store } = fakeCtx();
    store.set('plansnap:a', { symbol: 'NVDA', grade: { grade: 'A', score: 90 } });
    store.set('plansnap:b', { symbol: 'NVDA', grade: { grade: 'A', outcomes: [], score: NaN } });
    store.set('plansnap:c', { symbol: 'NVDA', grade: 'A' });
    expect((await loadPlanSnapshot(ctx, 'a'))!.grade).toBeNull();
    expect((await loadPlanSnapshot(ctx, 'b'))!.grade).toBeNull();
    expect((await loadPlanSnapshot(ctx, 'c'))!.grade).toBeNull();
  });

  it('normalises the frozen plan through the same guard as a live one', async () => {
    // Shared with `planStore.normalizePlan` on purpose: a stringy answer is truthy, and a
    // duplicated guard is the one that would be forgotten here, where nobody re-reads it.
    const { ctx, store } = fakeCtx();
    store.set('plansnap:lot-1', {
      symbol: 'nvda',
      plan: { answers: { real: true, stringy: 'true', numeric: 1 } },
    });
    const back = await loadPlanSnapshot(ctx, 'lot-1');
    expect(back!.symbol).toBe('NVDA');
    expect(back!.plan.symbol).toBe('NVDA');
    expect(back!.plan.answers).toEqual({ real: true });
  });

  it('refuses levels and shares that are not finite numbers', async () => {
    const { ctx, store } = fakeCtx();
    store.set('plansnap:lot-1', {
      symbol: 'NVDA',
      levels: { entry: 'x', stop: null, target: 130 },
      shares: 'many',
    });
    const back = await loadPlanSnapshot(ctx, 'lot-1');
    expect(back!.levels).toEqual({ entry: null, stop: null, target: 130 });
    expect(back!.shares).toBe(0);
  });

  it('reads an unreadable size allowance as full, not as none', async () => {
    // 0% would print the trade as having been allowed no size at all, which reads as a refusal
    // the app never made — and would be the most misleading line on a post-mortem.
    const { ctx, store } = fakeCtx();
    store.set('plansnap:lot-1', { symbol: 'NVDA', pctOfFull: 'half' });
    expect((await loadPlanSnapshot(ctx, 'lot-1'))!.pctOfFull).toBe(100);
  });

  it('defaults the currency rather than trusting the blob', async () => {
    const { ctx, store } = fakeCtx();
    store.set('plansnap:lot-1', { symbol: 'NVDA', currency: 'GBP' });
    expect((await loadPlanSnapshot(ctx, 'lot-1'))!.currency).toBe('USD');
    store.set('plansnap:lot-2', { symbol: 'NVDA', currency: 'EUR' });
    expect((await loadPlanSnapshot(ctx, 'lot-2'))!.currency).toBe('EUR');
  });
});

describe('lotIdsWithPlan', () => {
  it('returns bare lot ids, and ignores every other key in storage', async () => {
    // The transaction table matches these against `data-plan-lot`, which carries the lot id
    // with no prefix. A set of prefixed keys would unhide nothing, on every row.
    const { ctx, store } = fakeCtx();
    await savePlanSnapshot(ctx, SNAP);
    await savePlanSnapshot(ctx, { ...SNAP, lotId: 'lot-2' });
    store.set('plan:NVDA', {});
    store.set('accounts', {});
    expect(await lotIdsWithPlan(ctx)).toEqual(new Set(['lot-1', 'lot-2']));
  });

  it('is an empty set when the store cannot be listed', async () => {
    // The buttons stay hidden. Worse would be unhiding them all and having each open nothing.
    const ctx = {
      storage: { list: async () => { throw new Error('offline'); } },
    } as unknown as import('../src/context.js').AppContext;
    expect(await lotIdsWithPlan(ctx)).toEqual(new Set());
  });
});

describe('deletePlanSnapshot', () => {
  it('forgets the plan when its lot is deleted', async () => {
    // The lot id was the only way in, so a surviving snapshot is storage the sync carries
    // forever for a trade that no longer exists.
    const { ctx } = fakeCtx();
    await savePlanSnapshot(ctx, SNAP);
    await deletePlanSnapshot(ctx, 'lot-1');
    expect(await loadPlanSnapshot(ctx, 'lot-1')).toBeNull();
    expect(await lotIdsWithPlan(ctx)).toEqual(new Set());
  });
});
