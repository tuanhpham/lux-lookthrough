import { describe, it, expect } from 'vitest';
import {
  decidePull,
  decidePush,
  collapseVerdict,
  UNSTAMPED_PUSH_TS,
  COLLAPSE_RATIO,
} from '../../src/storage/syncMerge.js';
import type { MergeContext } from '../../src/storage/syncMerge.js';

/** Steady state: a device that has been synced for a while. */
const settled: MergeContext = { freshCode: false, writtenBeforeFirstPull: false };
/** The user just typed their access code on this device. */
const signingIn: MergeContext = { freshCode: true, writtenBeforeFirstPull: false };
/** This key was written before the first pull answered — presumed a default. */
const preBoot: MergeContext = { freshCode: false, writtenBeforeFirstPull: true };

// Concrete numbers from the incident: real portfolio written weeks ago, the new
// phone's empty starter account stamped the moment the app opened.
const REAL_DATA_TS = 1_750_000_000_000; // ~mid-2025
const NEW_DEVICE_TS = 1_780_000_000_000; // "now" on the fresh install — LATER

describe('decidePull', () => {
  it('takes the server copy when signing in, even though local looks newer', () => {
    // THE BUG. The new phone stamped `accounts` with a "now" that beats the real
    // data, so plain last-write-wins kept the empty starter account and pushed it
    // up. Signing in must mean download.
    expect(decidePull(REAL_DATA_TS, NEW_DEVICE_TS, signingIn)).toBe('apply-remote');
  });

  it('takes the server copy for a key written before the first pull landed', () => {
    // Tabs render before the network answers, seeding defaults. Those writes are
    // not considered edits and must not win.
    expect(decidePull(REAL_DATA_TS, NEW_DEVICE_TS, preBoot)).toBe('apply-remote');
  });

  it('takes the server copy when the key was never written locally', () => {
    // ts 0 is "no local write", not "written at the epoch" — the server always
    // knows better, even with an older-looking stamp.
    expect(decidePull(REAL_DATA_TS, 0, settled)).toBe('apply-remote');
  });

  it('keeps a genuinely newer local edit in steady state', () => {
    // The normal case must still work: edit on phone, older copy on desktop.
    expect(decidePull(REAL_DATA_TS, NEW_DEVICE_TS, settled)).toBe('keep-local');
  });

  it('applies a newer remote edit in steady state', () => {
    expect(decidePull(NEW_DEVICE_TS, REAL_DATA_TS, settled)).toBe('apply-remote');
  });

  it('keeps local on an exact timestamp tie', () => {
    // Same stamp = same value in practice; rewriting churns the store and would
    // re-archive an identical value on the server.
    expect(decidePull(REAL_DATA_TS, REAL_DATA_TS, settled)).toBe('keep-local');
  });
});

describe('decidePush', () => {
  it('never overwrites a server row while signing in', () => {
    // The other half of the bug: the fresh device must not upload its defaults
    // over the account's real data.
    expect(decidePush(NEW_DEVICE_TS, REAL_DATA_TS, signingIn)).toBe('skip');
  });

  it('still uploads local-only work when signing in', () => {
    // A device with real local work that the account has never seen must
    // CONTRIBUTE it, not lose it. Sign-in is download-first, not wipe-local.
    expect(decidePush(NEW_DEVICE_TS, null, signingIn)).toBe('push');
  });

  it('skips a key the server just won, so the restore is not undone', () => {
    expect(decidePush(NEW_DEVICE_TS, REAL_DATA_TS, preBoot)).toBe('skip');
    expect(decidePush(NEW_DEVICE_TS, null, preBoot)).toBe('skip');
  });

  it('never overwrites an existing row with an unstamped value', () => {
    // ts 0 means this device never explicitly wrote the key. Pushing it over a
    // real server row (which the old code did, at `Date.now()`) is data loss.
    expect(decidePush(0, REAL_DATA_TS, settled)).toBe('skip');
  });

  it('uploads an unstamped value only to fill a gap, at the lowest rank', () => {
    // Nothing on the server → uploading cannot destroy anything, and ranking it
    // lowest means any later real edit supersedes it.
    expect(decidePush(0, null, settled)).toBe('push-as-unstamped');
    expect(UNSTAMPED_PUSH_TS).toBe(1);
    expect(UNSTAMPED_PUSH_TS).toBeGreaterThan(0); // 0 would read as "unstamped"
    expect(UNSTAMPED_PUSH_TS).toBeLessThan(REAL_DATA_TS);
  });

  it('pushes a genuinely newer local edit in steady state', () => {
    expect(decidePush(NEW_DEVICE_TS, REAL_DATA_TS, settled)).toBe('push');
  });

  it('skips when the server is newer or tied', () => {
    expect(decidePush(REAL_DATA_TS, NEW_DEVICE_TS, settled)).toBe('skip');
    expect(decidePush(REAL_DATA_TS, REAL_DATA_TS, settled)).toBe('skip');
  });
});

describe('the two halves never both act on one key', () => {
  // If pull applies the remote value AND push uploads the local one, the result
  // depends on ordering — the class of race that made the loss non-deterministic.
  const cases: Array<[string, MergeContext]> = [
    ['settled', settled],
    ['signing in', signingIn],
    ['pre-first-pull', preBoot],
  ];
  const stamps = [0, REAL_DATA_TS, NEW_DEVICE_TS];

  for (const [name, ctx] of cases) {
    it(`holds for every timestamp pair — ${name}`, () => {
      for (const localTs of stamps) {
        for (const remoteTs of stamps) {
          const pulled = decidePull(remoteTs, localTs, ctx) === 'apply-remote';
          const pushed = decidePush(localTs, remoteTs, ctx) !== 'skip';
          expect(pulled && pushed, `local=${localTs} remote=${remoteTs}`).toBe(false);
        }
      }
    });
  }
});

describe('full-scenario replays', () => {
  it('replays the incident: new phone + access code keeps the real portfolio', () => {
    // Server holds the real portfolio; the fresh phone seeded an empty starter
    // account seconds ago and the user then entered the code.
    const ctx: MergeContext = { freshCode: true, writtenBeforeFirstPull: true };
    expect(decidePull(REAL_DATA_TS, NEW_DEVICE_TS, ctx)).toBe('apply-remote');
    expect(decidePush(NEW_DEVICE_TS, REAL_DATA_TS, ctx)).toBe('skip');
  });

  it('replays the good path: a real edit on device B reaches device A', () => {
    // Device B edited at NEW_DEVICE_TS and pushed. Device A boots with the older
    // copy and must receive the edit.
    expect(decidePull(NEW_DEVICE_TS, REAL_DATA_TS, settled)).toBe('apply-remote');
    expect(decidePush(REAL_DATA_TS, NEW_DEVICE_TS, settled)).toBe('skip');
  });

  it('replays first-ever sign-in with real local data and an empty server', () => {
    // The original design goal — do not wipe a device that has genuine work but
    // has never synced.
    expect(decidePush(REAL_DATA_TS, null, signingIn)).toBe('push');
  });
});

describe('collapseVerdict — the payload-shaped backstop', () => {
  /** A stand-in for a real `accounts` row: big enough to matter. */
  const realPortfolio = JSON.stringify(
    Array.from({ length: 40 }, (_, i) => ({
      ticker: `SYM${i}`,
      buyPrice: 100 + i,
      remainingShares: 10,
      stop: 90,
      target: 130,
    })),
  );
  /** What a fresh device seeds: ONE account with NO lots. */
  const starterAccount = JSON.stringify([
    { account: { name: 'Strategy A', initialCapital: 50000, currency: 'EUR' }, lots: [] },
  ]);

  it('refuses the exact write that caused the incident', () => {
    // ~4KB of positions replaced by a ~100-byte starter account.
    const verdict = collapseVerdict(realPortfolio, starterAccount);
    expect(verdict).toMatch(/discards \d+% of the stored value/);
  });

  it('catches a one-element starter account, which an emptiness test would miss', () => {
    // The starter account is `[{account:…, lots:[]}]` — a NON-empty array. This is
    // why the guard measures size instead of asking "is it empty?".
    expect(JSON.parse(starterAccount)).toHaveLength(1);
    expect(collapseVerdict(realPortfolio, starterAccount)).not.toBeNull();
  });

  it('refuses a literal empty array over real data too', () => {
    expect(collapseVerdict(realPortfolio, '[]')).not.toBeNull();
  });

  it('allows ordinary editing — closing one of many positions', () => {
    // Must not cry wolf: normal edits trim a few percent, and a false refusal
    // would silently stop real changes from syncing.
    const oneFewer = JSON.stringify(JSON.parse(realPortfolio).slice(0, 39));
    expect(collapseVerdict(realPortfolio, oneFewer)).toBeNull();
  });

  it('allows growth and identical rewrites', () => {
    const bigger = JSON.stringify([...JSON.parse(realPortfolio), { ticker: 'NEW' }]);
    expect(collapseVerdict(realPortfolio, bigger)).toBeNull();
    expect(collapseVerdict(realPortfolio, realPortfolio)).toBeNull();
  });

  it('ignores tiny values, where a ratio is meaningless', () => {
    // '{"a":1}' → '{}' is a 71% drop but only 5 bytes; blocking it would break
    // legitimate small keys like a UI preference being reset.
    expect(collapseVerdict('{"a":1}', '{}')).toBeNull();
  });

  it('has nothing to say when the server holds no value yet', () => {
    expect(collapseVerdict('', realPortfolio)).toBeNull();
  });

  it('sits exactly at the documented threshold', () => {
    const prev = 'x'.repeat(1000);
    // Just inside the allowance (keeps 51%) vs just past it (keeps 49%).
    expect(collapseVerdict(prev, 'x'.repeat(510))).toBeNull();
    expect(collapseVerdict(prev, 'x'.repeat(490))).not.toBeNull();
    expect(COLLAPSE_RATIO).toBe(0.5);
  });
});
