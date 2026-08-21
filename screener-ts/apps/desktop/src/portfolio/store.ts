/**
 * The portfolio's in-memory state and its single write path.
 *
 * Extracted from `tabs/portfolioTab.ts`, which owned `accounts`, `activeId`,
 * `load()` and `save()` as module-local variables. That was fine while the tab was
 * the only thing that touched a portfolio; it stopped being fine once the
 * assistant needed to read positions and record trades. Two copies of this state —
 * the tab's and the assistant's — would drift the moment either one wrote, and the
 * bug would look like "the chat says I own 300 shares and the table says 200".
 *
 * So there is exactly one copy, here, and exactly one way to persist it.
 *
 * ── WHY `accounts` IS AN EXPORTED `let` ─────────────────────────────────────
 * ES modules export live bindings: importers see the current value, not a snapshot.
 * That let ~40 existing read sites in the tab stay exactly as they were, which is
 * what makes this extraction a safe mechanical change rather than a rewrite of a
 * 2600-line file. The binding is read-only for importers, so every mutation that
 * changes the ARRAY IDENTITY goes through an accessor below — that is a feature,
 * not a workaround: those are the writes worth being able to grep for.
 *
 * ── THE RULES THAT MUST SURVIVE ANY REFACTOR ────────────────────────────────
 * 1. `saveAccounts` is the ONLY write path. It runs `toPersistable`, which strips
 *    the UI's `_candleCache`. Writing `ctx.storage.set(ACCT_KEY, …)` directly is
 *    how this key reached 912 KB and starved localStorage.
 * 2. The starter account created by `loadAccounts` is NEVER saved. Saving it would
 *    stamp `accounts` with a fresh "now", and on a device whose local storage was
 *    cleared before the first sync pull that empty default wins last-write-wins
 *    and destroys the real portfolio. It is persisted the first time the user
 *    actually does something.
 * 3. Agent-driven writes go through `withAccounts`, which refuses to run before
 *    hydration for the same reason as (2).
 */
import {
  createAccount,
  toPersistable,
  hasTransientFields,
  type AccountState,
  type IdFactory,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { onHydrated, isHydrated } from '../adapters/storage.js';

export const ACCT_KEY = 'accounts';
/** The pseudo-account id for the all-accounts view. */
export const OVERVIEW_ID = '__overview__';

export const uuid: IdFactory = () =>
  globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2);
export const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Every account, live. Importers may READ this directly (it is a live binding) but
 * cannot assign to it — use the accessors below.
 */
export let accounts: AccountState[] = [];

/** The selected account, or `OVERVIEW_ID`. */
let selectedId: string = OVERVIEW_ID;

export function activeId(): string {
  return selectedId;
}

export function setActiveId(id: string): void {
  selectedId = id;
}

/** The selected account, falling back to the first when Overview is showing. */
export function active(): AccountState {
  return accounts.find((a) => a.account.id === selectedId) ?? accounts[0]!;
}

/** Replace the whole list (load, and the delete-account path). */
export function setAccounts(next: AccountState[]): void {
  accounts = next;
}

/** Append an account and return it, so the caller can select it by id. */
export function addAccount(state: AccountState): AccountState {
  accounts.push(state);
  return state;
}

/** Drop one account. Callers must keep at least one — an empty list has no owner. */
export function removeAccount(id: string): void {
  accounts = accounts.filter((a) => a.account.id !== id);
}

// ── Change notification ─────────────────────────────────────────────────────
// Fired after every successful save. Deliberately NOT wired to a Portfolio
// redraw: the tab already redraws explicitly at each of its ~40 call sites, and
// subscribing it here would double every repaint. This exists for the OTHER
// readers of the portfolio — the assistant's chat panel needs to notice a trade it
// just recorded, and any future tab will need the same.
const listeners: Array<() => void> = [];

export function onPortfolioChange(cb: () => void): void {
  listeners.push(cb);
}

function announce(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* a listener must never break a save */
    }
  }
}

/** Set once the slimming callback has been registered, so it registers once. */
let slimmingScheduled = false;
/**
 * True once a blob carrying `_candleCache` has been seen locally at any point.
 *
 * Needed because a pre-hydration `save()` (the NaN scrub in `loadAccounts`) can
 * slim the LOCAL copy while its queued, unflagged push is 409'd by the server's
 * collapse guard — leaving local clean and the server still holding the fat row.
 * Once this is set, the post-hydration write goes ahead even though the re-read
 * looks slim, because that write is the only thing that fixes the server.
 */
let fatBlobSeen = false;

/**
 * Queue the one-time slimming of a fat `accounts` blob.
 *
 * Blobs written by an older build (or pulled from a server that still holds one)
 * carry `_candleCache` — full OHLCV bars per position — which is why this key
 * reached 912 KB and starved the rest of localStorage.
 *
 * The decision is deferred to hydration rather than made inline, for two reasons:
 *
 *  1. The slim value is >90% smaller, so the server's collapse guard refuses it
 *     unless the push is flagged `deliberate`, and only post-hydration writes are.
 *     Writing inline on a synced boot would eat a silent 409 and leave the 912 KB
 *     row on the server for the next device to download.
 *  2. THE CHECK ITSELF has to happen after the merge. At boot, local can be slim
 *     while the server still holds the fat row; deciding from the local copy alone
 *     would skip the migration, and then the merge would pull the fat blob back in
 *     with nothing left to notice. Reading inside the callback tests whichever copy
 *     actually won.
 *
 * `kv_history` keeps the fat version either way.
 *
 * Called at boot (see `main.ts`) rather than only from `loadAccounts`, because the
 * default tab is no longer Portfolio. Leaving it tab-scoped meant a user who never
 * opened Portfolio kept paying the 912 KB on every sync, indefinitely.
 */
export function migrateAccountsBlob(ctx: AppContext): void {
  if (slimmingScheduled) return;
  slimmingScheduled = true;
  onHydrated(() => {
    void (async () => {
      const now = (await ctx.storage.get<AccountState[]>(ACCT_KEY)) ?? [];
      if (!now.length) return;
      if (!fatBlobSeen && !hasTransientFields(now)) return;
      // This push carries `deliberate`, so the collapse guard lets the small value in.
      await ctx.storage.set(ACCT_KEY, toPersistable(now));
    })().catch(() => {});
  });
}

export async function loadAccounts(ctx: AppContext): Promise<void> {
  const stored = (await ctx.storage.get<AccountState[]>(ACCT_KEY)) ?? [];

  // Strip the cache from the in-memory copy: `accounts` must never hold
  // `_candleCache` read back from storage, or the next save would write it
  // straight out again.
  const fat = hasTransientFields(stored);
  if (fat) fatBlobSeen = true;
  accounts = fat ? toPersistable(stored) : stored;
  // No-op after boot registered it; kept so the migration still runs if Portfolio
  // is somehow reached before enterApp() has (e.g. a future deep link).
  migrateAccountsBlob(ctx);

  let dirty = false;
  if (!accounts.length) {
    // Auto-create a starter account for DISPLAY ONLY — do NOT save it.
    //
    // Saving here would stamp the `accounts` key with a fresh "now" timestamp
    // and (when sync is on) push this empty default to the server. If local
    // storage was cleared before a sync pull completed, that empty default
    // would win last-write-wins and WIPE the real synced portfolio. By keeping
    // it in memory only, tsOf('accounts') stays 0, so a later pullAndMerge
    // always treats the server copy as newer and restores it. The account is
    // persisted the first time the user actually acts (buy / add account).
    accounts = [
      createAccount(
        { name: 'Strategy A', initialCapital: 50000, currency: 'EUR', createdAt: today() },
        uuid,
      ),
    ];
  }
  // Scrub any NaN stop/target values that may have been stored via comma-decimal
  // input (e.g. "185,50" parsed by Number() → NaN). NaN is a valid JS value but
  // causes riskEur / rMultiple to silently become NaN and display as "—".
  for (const acct of accounts) {
    for (const lot of acct.lots) {
      if (lot.stop !== undefined && isNaN(lot.stop)) {
        lot.stop = undefined;
        dirty = true;
      }
      if (lot.target !== undefined && isNaN(lot.target)) {
        lot.target = undefined;
        dirty = true;
      }
    }
  }
  if (dirty) await saveAccounts(ctx);
  if (selectedId !== OVERVIEW_ID && !accounts.some((a) => a.account.id === selectedId)) {
    selectedId = OVERVIEW_ID;
  }
}

/**
 * The ONLY write path for `accounts`.
 *
 * `toPersistable` strips the UI's chart caches (`_candleCache`) before anything
 * reaches storage. It used to write the live objects verbatim, which put full
 * OHLCV bars for every position into localStorage and pushed them to D1 on every
 * Update — 912 KB for four accounts, most of a 5 MB quota, for data rebuilt from
 * `pf_bars:*` on load anyway. Do not call `ctx.storage.set(ACCT_KEY, ...)`
 * directly; the filter has to be unconditional to stay effective. (The migration
 * above is the one exception — it writes a re-read blob rather than the in-memory
 * state, and still runs it through `toPersistable`.)
 */
export async function saveAccounts(ctx: AppContext): Promise<void> {
  await ctx.storage.set(ACCT_KEY, toPersistable(accounts));
  announce();
}

/**
 * Apply a mutation and persist it — the write path for callers that are not the
 * Portfolio tab (i.e. the assistant's tools).
 *
 * REFUSES TO RUN BEFORE HYDRATION. While a sync code is set but the first pull has
 * not landed, `accounts` may still be the in-memory starter account rather than
 * the real portfolio; recording a trade onto that and saving it would stamp an
 * almost-empty blob with a fresh "now" and let it win last-write-wins against
 * weeks of real data. Refusing is recoverable — the caller says "try again in a
 * moment" — and the alternative is not.
 *
 * Returns whatever `mutate` returns, so a tool can report what it actually did.
 */
export async function withAccounts<T>(
  ctx: AppContext,
  mutate: (list: AccountState[]) => T,
): Promise<T> {
  if (!isHydrated()) {
    throw new Error('portfolio is still syncing — not safe to write yet');
  }
  const result = mutate(accounts);
  await saveAccounts(ctx);
  return result;
}
