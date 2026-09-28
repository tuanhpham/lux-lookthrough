/**
 * The A/B/C lines — the one half of the conviction checklist the user is allowed to move.
 *
 * ── WHY THIS IS WORTH ITS OWN FILE ──────────────────────────────────────────
 * `GRADE_BARS` are quotations and stay in core as constants; where the letters fall is a
 * question about the user's own selectivity and is therefore stored config. Stored config
 * arrives from the sync blob, which means it can be anything: a half-finished edit, a
 * hand-typed JSON, an older version of the app. And the failure direction is asymmetric —
 * a threshold that comes back as 0 makes EVERY trade an A, which raises position size on
 * the worst setups the app can find. So the clamp is checked here rather than trusted.
 *
 * Module state lives at module scope, so each case loads fresh modules — same reason as
 * `buyPlan.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_GRADE_THRESHOLDS } from '@screener/core';

async function load() {
  vi.resetModules();
  const store = new Map<string, unknown>();
  const ctx = {
    storage: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: unknown) => void store.set(k, v),
    },
  } as unknown as import('../src/context.js').AppContext;
  const pb = await import('../src/portfolio/playbook.js');
  return { ctx, pb, store };
}

describe('gradeThresholds', () => {
  it('ships the defaults when the user has set nothing', async () => {
    const { ctx, pb } = await load();
    await pb.loadPlaybookConfig(ctx);
    expect(pb.gradeThresholds()).toEqual(DEFAULT_GRADE_THRESHOLDS);
  });

  it('takes the user’s lines when they have set them', async () => {
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      ...pb.EMPTY_PLAYBOOK_CONFIG, gradeThresholds: { a: 90, b: 75, c: 60 },
    });
    expect(pb.gradeThresholds()).toEqual({ a: 90, b: 75, c: 60 });
  });

  it('merges one line over the defaults rather than blanking the others', async () => {
    // A stored `{ a: 85 }` must leave B and C at the shipped numbers. If the merge were
    // wholesale, B and C would come back undefined and every comparison against them
    // would be false — so a 70% trade would fall through to D.
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      ...pb.EMPTY_PLAYBOOK_CONFIG, gradeThresholds: { a: 85 },
    });
    expect(pb.gradeThresholds()).toEqual({
      a: 85, b: DEFAULT_GRADE_THRESHOLDS.b, c: DEFAULT_GRADE_THRESHOLDS.c,
    });
  });

  it('refuses a zero, which would make every trade an A', async () => {
    // The dangerous direction. A 0 line means `score >= 0` is always true, so the worst
    // setup the app can measure would be graded A and sized accordingly.
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      ...pb.EMPTY_PLAYBOOK_CONFIG, gradeThresholds: { a: 0, b: 0, c: 0 },
    });
    expect(pb.gradeThresholds()).toEqual(DEFAULT_GRADE_THRESHOLDS);
  });

  it('refuses nonsense — negatives, NaN, and anything over 100', async () => {
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      ...pb.EMPTY_PLAYBOOK_CONFIG,
      gradeThresholds: { a: 140, b: -5, c: Number.NaN },
    });
    expect(pb.gradeThresholds()).toEqual(DEFAULT_GRADE_THRESHOLDS);
  });

  it('re-orders lines that arrive out of order instead of hiding a letter', async () => {
    // With `{ a: 40, b: 90 }` the grader's own `score >= a ? 'A' : score >= b ? 'B'` can
    // never return a B: anything clearing 90 already cleared 40. Sorting descending gives
    // a strange-looking but coherent scale rather than a letter that cannot occur.
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      ...pb.EMPTY_PLAYBOOK_CONFIG, gradeThresholds: { a: 40, b: 90, c: 65 },
    });
    expect(pb.gradeThresholds()).toEqual({ a: 90, b: 65, c: 40 });
  });

  it('survives a config saved by an older version with no such field', async () => {
    // The sync blob outlives the code that wrote it. A config from before this field
    // existed must read as "defaults", not crash on a spread of undefined.
    const { ctx, pb, store } = await load();
    // The real storage key, so this test actually goes through the load path. Spelled
    // wrong it would read as "nothing stored" and pass without proving anything.
    store.set('pf_playbook_cfg', { setups: { VCP: { padPct: 1 } }, ladder: {}, pinnedRiskPct: null });
    const cfg = await pb.loadPlaybookConfig(ctx);
    expect(cfg.setups.VCP, 'the legacy config must actually have been read').toBeDefined();
    expect(cfg.gradeThresholds).toEqual({});
    expect(pb.gradeThresholds()).toEqual(DEFAULT_GRADE_THRESHOLDS);
  });

  it('keeps the letters in a usable order for every accepted config', async () => {
    const { ctx, pb } = await load();
    for (const g of [{ a: 95, b: 60, c: 30 }, { a: 50, b: 50, c: 50 }, { b: 99 }, {}]) {
      await pb.savePlaybookConfig(ctx, { ...pb.EMPTY_PLAYBOOK_CONFIG, gradeThresholds: g });
      const th = pb.gradeThresholds();
      expect(th.a, JSON.stringify(g)).toBeGreaterThanOrEqual(th.b);
      expect(th.b, JSON.stringify(g)).toBeGreaterThanOrEqual(th.c);
      expect(th.c, JSON.stringify(g)).toBeGreaterThan(0);
    }
  });
});
