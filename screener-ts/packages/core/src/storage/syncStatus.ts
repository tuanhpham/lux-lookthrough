/**
 * What the sync indicator should say, as a pure function.
 *
 * Lives beside `syncMerge.ts` and for the same reason: the interesting part is a
 * set of precedence rules that are easy to get subtly wrong, and wrong here means
 * the UI reassures the user while their data is going nowhere. The incident in
 * RECOVERY.md was invisible for weeks — every write appeared to succeed because
 * nothing ever claimed otherwise. A device that is not saving must SAY so.
 *
 * The ordering below is the whole design. Read it as "what would mislead the user
 * most?", worst first:
 *   1. No access code → nothing is being saved anywhere but this device. This
 *      outranks everything, including a queue or an error, because it is not a
 *      transient condition and it is the one the user can act on.
 *   2. The first pull FAILED → the hydration gate never opened, so every write of
 *      this session is sitting in a queue that nothing will ever flush. Worse than
 *      a failed push (which loses one key), and it must not read as 'pending':
 *      that is a spinner promising an outcome that will never arrive.
 *   3. A failed push → the local copy is ahead of the server. Silent until now.
 *   4. Work still queued or the gate still shut → in flight, outcome unknown.
 *   5. Otherwise → saved, and `lastPushAt` says when.
 *
 * Note `error` beats `pending`: with a failure recorded, a later queued write does
 * not make the earlier loss less real, and "Syncing…" would imply it was handled.
 */

/** The indicator's state. One of these, never a combination. */
export type SyncPhase =
  /** No access code on this device — local-only, nothing is being uploaded. */
  | 'off'
  /** A push failed; the server is behind the local copy. */
  | 'error'
  /** Writes are queued, or the first pull has not landed yet. */
  | 'pending'
  /** Everything written here has reached the server. */
  | 'ok';

export interface SyncStatusInput {
  /** An access code is stored on this device. */
  hasCode: boolean;
  /** The first pull of this session has completed (the hydration gate is open). */
  hydrated: boolean;
  /** Writes waiting for the gate to open, or in flight. */
  queued: number;
  /** When a push last succeeded, epoch ms, or null if never on this device. */
  lastPushAt: number | null;
  /** Message from the most recent failed push, cleared by the next success. */
  lastError: string | null;
  /**
   * Message from the most recent failed PULL, cleared by the next success — the
   * download half, which is what opens the hydration gate. Separate from
   * `lastError` because the consequence is different in kind: a failed push is one
   * key behind, a failed pull is a device that has not started syncing at all.
   */
  pullError: string | null;
}

export interface SyncStatusView {
  phase: SyncPhase;
  /** i18n key for the pill's label. */
  labelKey: string;
  /** Show `lastPushAt` as a time next to the label. */
  showTime: boolean;
  /**
   * Whether the label must be rendered as text rather than collapsing to a bare
   * dot. Healthy sync is a dot; anything the user should act on keeps its words,
   * so a problem is the only thing in the top bar with text.
   */
  verbose: boolean;
}

/**
 * Resolve the indicator state. Total and side-effect free, so every precedence
 * rule above is directly testable.
 *
 * `lastPushAt` is deliberately NOT consulted for the phase — only for the label.
 * A device with a months-old successful push and a code is still 'ok'; it has
 * simply not written anything since. Treating staleness as a fault would cry wolf
 * on any quiet week, and the genuine faults ('off', 'error') are already covered.
 */
export function deriveSyncStatus(input: SyncStatusInput): SyncStatusView {
  if (!input.hasCode) {
    return { phase: 'off', labelKey: 'sync.state.off', showTime: false, verbose: true };
  }
  if (input.pullError) {
    // Same 'error' phase — red, bordered, retryable by clicking the pill — but its
    // own label, because the remedy differs: a failed push usually just needs
    // another try, while a pull that keeps failing is a connection or a code that
    // no longer works, and the message says which.
    return { phase: 'error', labelKey: 'sync.state.stalled', showTime: false, verbose: true };
  }
  if (input.lastError) {
    return { phase: 'error', labelKey: 'sync.state.error', showTime: false, verbose: true };
  }
  if (!input.hydrated || input.queued > 0) {
    return { phase: 'pending', labelKey: 'sync.state.pending', showTime: false, verbose: false };
  }
  return {
    phase: 'ok',
    labelKey: 'sync.state.ok',
    showTime: input.lastPushAt !== null,
    verbose: false,
  };
}
