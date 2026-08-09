import { describe, it, expect } from 'vitest';
import { decideSweep, recordSweep, type SweepLog } from '../../src/catalysts/sweepPolicy.js';

const TODAY = '2026-08-09';

describe('decideSweep — "once a day" must not depend on the snapshot saving', () => {
  it('sweeps on a fresh install', () => {
    expect(decideSweep({ today: TODAY, hasSnapshotForToday: false, log: null })).toBe('sweep');
  });

  it('uses today\'s snapshot when there is one', () => {
    expect(decideSweep({ today: TODAY, hasSnapshotForToday: true, log: null })).toBe('use-snapshot');
  });

  it('does NOT re-sweep when today\'s sweep left no snapshot', () => {
    // THE REGRESSION. "Once a day" used to mean "is there a snapshot for today?",
    // so a snapshot that failed to store (localStorage full) meant every single
    // tab open fired a fresh ~60-request sweep.
    const log: SweepLog = { lastSweepDay: TODAY, at: 1 };
    expect(decideSweep({ today: TODAY, hasSnapshotForToday: false, log })).toBe(
      'swept-but-no-snapshot',
    );
  });

  it('sweeps again once the date rolls over', () => {
    const log: SweepLog = { lastSweepDay: '2026-08-08', at: 1 };
    expect(decideSweep({ today: TODAY, hasSnapshotForToday: false, log })).toBe('sweep');
  });

  it('prefers today\'s snapshot even if the receipt is older', () => {
    // A snapshot synced from another device that swept today: use it, don't sweep.
    const log: SweepLog = { lastSweepDay: '2026-08-01', at: 1 };
    expect(decideSweep({ today: TODAY, hasSnapshotForToday: true, log })).toBe('use-snapshot');
  });

  it('treats a future receipt as already swept, not as a reason to sweep', () => {
    // A device clock moved backwards, or a receipt synced from a later timezone.
    // Comparing with `>=` keeps this from re-sweeping on every open until the
    // calendar catches up — one stale day is cheaper than 60 requests per open.
    const log: SweepLog = { lastSweepDay: '2026-08-10', at: 1 };
    expect(decideSweep({ today: TODAY, hasSnapshotForToday: false, log })).toBe(
      'swept-but-no-snapshot',
    );
  });

  it('is stable across repeated calls — the same inputs never start a second sweep', () => {
    // renderStatus() runs on every re-render (each filter chip click), so this
    // being a pure function of stored state is what bounds the request count.
    const log: SweepLog = { lastSweepDay: TODAY, at: 1 };
    const input = { today: TODAY, hasSnapshotForToday: false, log };
    const seen = new Set(Array.from({ length: 20 }, () => decideSweep(input)));
    expect([...seen]).toEqual(['swept-but-no-snapshot']);
  });
});

describe('recordSweep', () => {
  it('records the day and counts a first sweep', () => {
    const log = recordSweep(null, TODAY, 1000);
    expect(log).toEqual({ lastSweepDay: TODAY, at: 1000, count: 1 });
  });

  it('counts manual refreshes on the same day', () => {
    const once = recordSweep(null, TODAY, 1000);
    const twice = recordSweep(once, TODAY, 2000);
    expect(twice.count).toBe(2);
    expect(twice.at).toBe(2000);
  });

  it('resets the count on a new day', () => {
    const yesterday = recordSweep(null, '2026-08-08', 1000);
    expect(recordSweep(yesterday, TODAY, 2000)).toEqual({
      lastSweepDay: TODAY, at: 2000, count: 1,
    });
  });

  it('feeds straight back into decideSweep', () => {
    // The receipt written after a fetch must be the thing that stops the next
    // automatic sweep — otherwise the two halves can drift apart.
    const log = recordSweep(null, TODAY, 1000);
    expect(decideSweep({ today: TODAY, hasSnapshotForToday: false, log })).toBe(
      'swept-but-no-snapshot',
    );
  });
});
