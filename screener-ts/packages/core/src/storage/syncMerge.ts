/**
 * The conflict-resolution rules for cross-device sync, as pure functions.
 *
 * These live in core, away from fetch/localStorage, because getting them wrong
 * DESTROYS USER DATA and they must be testable. They were extracted after a real
 * incident: signing in on a new phone wiped a live portfolio, permanently.
 *
 * ── Why the naive rule fails ─────────────────────────────────────────────────
 * Sync is last-write-wins on a timestamp the CLIENT supplies. That is sound
 * between two devices that both hold real data, and unsound the moment a fresh
 * install joins: its first-boot defaults (starter account, default watchlist,
 * seeded prompts) are stamped `Date.now()`, which outranks real data written any
 * time earlier. One push and the server row is replaced.
 *
 * The rules below encode "a value's rank is not just its clock":
 *   • Signing in means DOWNLOAD. A local value produced before this device knew
 *     the account cannot outrank the account's own copy.
 *   • Values written before the first pull landed are presumed defaults and lose.
 *   • An unstamped key (ts 0) was never explicitly written here, so it may fill a
 *     gap on the server but must never overwrite an existing row.
 */

/** What the merge should do with one key, locally. */
export type PullDecision =
  /** Overwrite the local value with the server's. */
  | 'apply-remote'
  /** Keep the local value; the server's is older or beaten. */
  | 'keep-local';

/** What the merge should do with one key, remotely. */
export type PushDecision =
  /** Upload the local value at its own timestamp. */
  | 'push'
  /** Upload it, but ranked lowest so any real edit supersedes it. */
  | 'push-as-unstamped'
  /** Leave the server alone. */
  | 'skip';

export interface MergeContext {
  /**
   * True when the user has JUST entered an access code on this device. The
   * highest-risk moment: everything local was produced with no knowledge of the
   * account, so the server wins every key it holds.
   */
  freshCode: boolean;
  /**
   * True when this key was written locally after sync was enabled but before the
   * first pull completed — i.e. almost certainly a first-boot default whose
   * "now" stamp is meaningless.
   */
  writtenBeforeFirstPull: boolean;
}

/**
 * Should the remote value replace the local one?
 *
 * `localTs === 0` means this device never explicitly wrote the key, so anything
 * the server has is better — including a value with a lower timestamp, since 0
 * is not a real write time.
 */
export function decidePull(
  remoteUpdatedAt: number,
  localTs: number,
  ctx: MergeContext,
): PullDecision {
  if (ctx.freshCode) return 'apply-remote';
  if (ctx.writtenBeforeFirstPull) return 'apply-remote';
  if (localTs === 0) return 'apply-remote';
  return remoteUpdatedAt > localTs ? 'apply-remote' : 'keep-local';
}

/**
 * Should the local value be pushed up?
 *
 * `remoteUpdatedAt === null` means the server has no row for this key. Then even
 * an unstamped local value is worth uploading — it fills a genuine gap and
 * cannot destroy anything — but at the lowest rank, so a later real edit from any
 * device wins over it.
 */
export function decidePush(
  localTs: number,
  remoteUpdatedAt: number | null,
  ctx: MergeContext,
): PushDecision {
  // The pull half just handed this key to the server; re-uploading the local
  // value would undo the restore we performed a moment ago.
  if (ctx.writtenBeforeFirstPull) return 'skip';
  if (remoteUpdatedAt === null) {
    return localTs > 0 ? 'push' : 'push-as-unstamped';
  }
  if (ctx.freshCode) return 'skip'; // signing in downloads; it never overwrites
  // An unstamped key must not overwrite a row the server actually holds.
  if (localTs === 0) return 'skip';
  return localTs > remoteUpdatedAt ? 'push' : 'skip';
}

/**
 * Timestamp for uploading a value that was never explicitly written on this
 * device. Deliberately the lowest possible non-zero value: the row lands on the
 * server, but any real write outranks it. Using `Date.now()` here is precisely
 * what let a new device's defaults beat months-old data.
 */
export const UNSTAMPED_PUSH_TS = 1;
