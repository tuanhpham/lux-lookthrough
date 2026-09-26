/**
 * The sync indicator in the top bar.
 *
 * Why it exists: pushes to D1 are fire-and-forget, so before this a device could
 * stop saving — or never have been saving, having no access code — and the app
 * looked identical either way. That is how the loss in RECOVERY.md went unnoticed
 * for weeks. The prevention work (hydration gate, collapse guard, kv_history)
 * stops the data being destroyed; this stops the silence.
 *
 * The visual rule: healthy sync is a bare dot, so the states worth acting on
 * ('Local only', 'Not saved') are the only things in the top bar with words.
 * Phase selection itself is `deriveSyncStatus` in core, where it is unit-tested.
 */
import { deriveSyncStatus, type SyncPhase } from '@screener/core';
import type { AppContext } from '../context.js';
import { isSyncEnabled } from '../adapters/syncClient.js';
import {
  isHydrated,
  onSyncActivity,
  primeLastPushAt,
  retryPull,
  syncActivity,
  type SyncActivity,
} from '../adapters/storage.js';
import { openSyncSettings } from './syncSettings.js';
import { t, onLangChange } from './i18n.js';

/**
 * Device-local record of the last successful push, so a reload does not report a
 * freshly-booted device as never-synced.
 *
 * The `sync:` prefix is load-bearing: `syncable()` in the storage adapter excludes
 * it, so this marker stays on the device and is never uploaded. Syncing it would
 * recreate the `pf_bars:` mistake — a key rewritten on every push, each rewrite
 * another "now"-stamped race against the merge.
 */
const LAST_PUSH_KEY = 'sync:lastPush';

/**
 * Coalescing window. `accounts` is rewritten several times in a row on load (NaN
 * stop scrubbing, chart-cache stripping), and each push would otherwise repaint
 * the pill — a visible flicker on every Portfolio open.
 */
const REPAINT_MS = 400;

let el: HTMLButtonElement | null = null;
let ctxRef: AppContext | null = null;
let repaintTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersisted = 0;
let phase: SyncPhase = 'ok';

/** Dot-only phases still need an accessible name, so the label is always set. */
function render(): void {
  if (!el) return;
  const activity = syncActivity();
  const view = deriveSyncStatus({
    hasCode: isSyncEnabled(),
    hydrated: isHydrated(),
    queued: activity.queued,
    lastPushAt: activity.lastPushAt,
    lastError: activity.lastError,
    pullError: activity.pullError,
  });
  phase = view.phase;

  let label = t(view.labelKey);
  if (view.showTime && activity.lastPushAt !== null) {
    label += ' ' + new Date(activity.lastPushAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  el.className = `sync-status sync-status--${view.phase}${view.verbose ? ' sync-status--verbose' : ''}`;
  // The dot is a separate span so the label can be hidden by CSS on narrow
  // screens without losing the only visible part of the indicator.
  el.innerHTML = `<span class="sync-status-dot"></span><span class="sync-status-label"></span>`;
  el.querySelector('.sync-status-label')!.textContent = label;
  // The error text is the useful detail, so it goes in the tooltip verbatim: an
  // `HTTP 401` there is the difference between "no signal" and "this code was
  // revoked", and neither is guessable from a coloured dot.
  el.title = activity.pullError
    ? `${label}: ${activity.pullError}`
    : activity.lastError
      ? `${t('sync.state.error')}: ${activity.lastError}`
      : `${label} — ${t('sync.status.hint')}`;
  el.setAttribute('aria-label', el.title);
}

/** Repaint at most once per `REPAINT_MS`, and persist a new success time. */
function onActivity(a: SyncActivity): void {
  if (a.lastPushAt !== null && a.lastPushAt !== lastPersisted) {
    lastPersisted = a.lastPushAt;
    // Fire-and-forget, and never syncable, so this cannot loop back into a push.
    void ctxRef?.storage.set(LAST_PUSH_KEY, a.lastPushAt).catch(() => {});
  }
  if (repaintTimer) return;
  repaintTimer = setTimeout(() => {
    repaintTimer = null;
    render();
  }, REPAINT_MS);
}

/**
 * Create the pill and wire it. Idempotent: re-labels an existing element rather
 * than rebuilding it, so the click listener survives a language change (the same
 * reason `mountChatLauncher` is written this way).
 */
export function mountSyncStatus(ctx: AppContext): void {
  ctxRef = ctx;
  const nav = document.getElementById('topnav');
  if (!nav) return;

  if (!el) {
    el = document.createElement('button');
    el.id = 'sync-status';
    el.type = 'button';
    el.addEventListener('click', () => {
      // An error is the one state with a cheaper remedy than the dialog: the
      // merge's push-up half already re-sends every locally-newer key, so a retry
      // needs no new push logic. If it fails again the pill stays red and a second
      // click is available; the dialog is one menu item away for anything else.
      //
      // `retryPull`, not `pullAndMerge`: when the stall was a failed sign-in the
      // retry has to keep that call's `freshCode`, or it becomes an upload of this
      // device's pre-account data.
      if (phase === 'error') {
        const stalled = syncActivity().pullError !== null;
        void retryPull(ctx.synced)
          .catch(() => {})
          .finally(render);
        // A stalled pull also OPENS the dialog, where the state is spelled out. On
        // a phone the pill is a bare dot with no tooltip, so a tap that silently
        // retried and failed again would leave nothing to read at all.
        if (!stalled) return;
      }
      openSyncSettings(ctx);
    });
    // Before the hamburger so the menu button stays the rightmost control.
    nav.insertBefore(el, document.getElementById('menu-toggle'));

    onSyncActivity(onActivity);
    onLangChange(() => render());

    // Carry the previous session's success time over, so a device that simply
    // has not written anything yet still shows when it last did.
    void ctx.storage
      .get<number>(LAST_PUSH_KEY)
      .then((at) => {
        if (typeof at === 'number') {
          lastPersisted = at;
          primeLastPushAt(at); // emits, which repaints
        }
      })
      .catch(() => {});
  }
  render();
}

/** Repaint now, skipping the coalescing delay (after sign-in / sign-out). */
export function refreshSyncStatus(): void {
  render();
}
