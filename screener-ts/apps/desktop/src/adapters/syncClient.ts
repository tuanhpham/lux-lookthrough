/**
 * Thin client for the /api/sync D1 backend, plus the local persistence of the
 * user's access code. The code identifies "you + a few invited people" — it's
 * stored in localStorage and sent as the `X-Sync-Code` header on every call.
 *
 * No code set → sync is simply OFF and the app stays local-only (the
 * RemoteStorage adapter falls back to its local mirror). This keeps sync purely
 * additive: the app works exactly as before for anyone without a code.
 */

const CODE_KEY = 'sync:code';
const BASE = '/api/sync';

let cachedCode: string | null = null;
let initialised = false;

function loadCode(): string | null {
  if (!initialised) {
    try {
      cachedCode = localStorage.getItem(CODE_KEY);
    } catch {
      cachedCode = null;
    }
    initialised = true;
  }
  return cachedCode;
}

export function getSyncCode(): string | null {
  return loadCode();
}

export function isSyncEnabled(): boolean {
  return !!loadCode();
}

export function setSyncCode(code: string | null): void {
  cachedCode = code && code.trim() ? code.trim() : null;
  initialised = true;
  try {
    if (cachedCode) localStorage.setItem(CODE_KEY, cachedCode);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore quota / disabled storage */
  }
}

/**
 * Every sync request gets a deadline.
 *
 * `fetch` has no timeout of its own: a request can stay pending for as long as the
 * platform allows, and on a phone that is routinely forever — a radio that changes
 * state mid-request (Wi-Fi → cellular, screen lock, a captive portal) leaves the
 * promise unsettled rather than rejecting it. That is the difference between "sync
 * failed, retrying" and a dialog stuck on "Pulling your data…" with a grey pulsing
 * dot and nothing to read. A deadline converts an invisible hang into an ordinary
 * error, which the retry path already knows how to handle.
 *
 * Generous on purpose: the bulk pull can legitimately take a while on a slow link,
 * and a timeout that fires on a working-but-slow connection would be its own bug.
 */
const TIMEOUT_MS = 25_000;

async function req(url: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    // An abort arrives as a bare "AbortError", which tells the user nothing.
    if ((e as Error)?.name === 'AbortError') {
      throw new Error(`no answer after ${TIMEOUT_MS / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function headers(): Record<string, string> {
  const code = loadCode();
  return {
    'content-type': 'application/json',
    ...(code ? { 'x-sync-code': code } : {}),
  };
}

export interface SyncEntry {
  key: string;
  value: unknown;
  updatedAt: number;
}

/** Validate a code against the server. Returns the user's name on success. */
export async function verifyCode(code: string): Promise<{ ok: boolean; name?: string | null }> {
  try {
    const res = await req(`${BASE}/whoami`, { headers: { 'x-sync-code': code.trim() } });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { ok?: boolean; name?: string | null };
    return { ok: !!body.ok, name: body.name };
  } catch {
    return { ok: false };
  }
}

/** Read one key. Returns null when absent or when sync is off. */
export async function remoteGet<T>(key: string): Promise<{ value: T; updatedAt: number } | null> {
  if (!isSyncEnabled()) return null;
  const res = await req(`${BASE}/kv/${encodeURI(key)}`, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sync get ${key}: HTTP ${res.status}`);
  return (await res.json()) as { value: T; updatedAt: number };
}

/**
 * Upsert one key with a last-write-wins timestamp.
 *
 * The server refuses (409) a write that discards most of the stored value — its
 * collapse guard, the backstop against a fresh device wiping real data. That guard
 * cannot tell a wipe from a deliberate mass delete, so the CLIENT resolves it:
 * pass `deliberate: true` for a write that came from a user action on a hydrated
 * store, and the retry carries `?allowShrink=1`.
 *
 * Never pass it for first-boot defaults or for the merge's push-up half — those
 * are exactly the writes the guard exists to stop, and a 409 there is the correct
 * outcome (the server keeps its value, and the next pull brings it down).
 */
// ── Viewer mode (CHAT-102) ────────────────────────────────────────────────────
// A sync code the admin shared their data with VIEWS that data and writes nothing: every
// upload and delete stops here, the one place they all pass. The server refuses them too;
// this keeps a viewing device from even trying (and from showing push errors for it).
let viewer = false;
export function setViewerMode(on: boolean): void { viewer = on; }
export function isViewerMode(): boolean { return viewer; }

/** What the admin shared: whose data, which pages, which portfolio accounts. */
export interface ShareInfo { owner: string; ownerName: string | null; pages: string[]; accounts: string[] }

/** The owner's data, already filtered by the server to what was shared. */
export async function sharedPull(): Promise<{ share: ShareInfo; entries: SyncEntry[] }> {
  const res = await req(`${BASE}/shared/pull`, { method: 'POST', headers: headers(), body: '{}' });
  if (!res.ok) throw new Error(`shared pull: HTTP ${res.status}`);
  const b = (await res.json()) as ShareInfo & { entries: SyncEntry[] };
  return { share: { owner: b.owner, ownerName: b.ownerName, pages: b.pages, accounts: b.accounts }, entries: b.entries ?? [] };
}

export async function remotePut<T>(
  key: string,
  value: T,
  updatedAt: number,
  opts: { deliberate?: boolean } = {},
): Promise<void> {
  if (!isSyncEnabled() || viewer) return;
  const body = JSON.stringify({ value, updatedAt });
  const put = (qs = '') =>
    req(`${BASE}/kv/${encodeURI(key)}${qs}`, { method: 'PUT', headers: headers(), body });

  let res = await put();
  if (res.status === 409 && opts.deliberate) {
    // The user really did shrink this key. Re-send with the override; the server
    // still archives the previous value to kv_history, so it stays undoable.
    res = await put('?allowShrink=1');
  }
  if (!res.ok) throw new Error(`sync put ${key}: HTTP ${res.status}`);
}

export async function remoteDelete(key: string): Promise<void> {
  if (!isSyncEnabled() || viewer) return;
  const res = await req(`${BASE}/kv/${encodeURI(key)}`, { method: 'DELETE', headers: headers() });
  if (!res.ok && res.status !== 404) throw new Error(`sync delete ${key}: HTTP ${res.status}`);
}

export async function remoteList(prefix = ''): Promise<string[]> {
  if (!isSyncEnabled()) return [];
  const res = await req(`${BASE}/kv?prefix=${encodeURIComponent(prefix)}`, { headers: headers() });
  if (!res.ok) throw new Error(`sync list: HTTP ${res.status}`);
  const body = (await res.json()) as { keys: string[] };
  return body.keys ?? [];
}

/** One archived version of a key: an overwritten value or a deleted row. */
export interface SyncVersion {
  key: string;
  value: unknown;
  /** The value's own last-write stamp. */
  updatedAt: number;
  /** When it was superseded — the id used to restore it. */
  archivedAt: number;
  how: 'overwrite' | 'delete';
  bytes: number;
}

/**
 * Every archived version the server still holds, newest first. This is the
 * recovery surface for a bad last-write-wins merge: the live `kv` row may be an
 * empty default, but the real value it replaced is here.
 */
export async function remoteHistory(key?: string, opts: { lite?: boolean } = {}): Promise<SyncVersion[]> {
  if (!isSyncEnabled()) return [];
  // `lite`: sizes only, `value` comes back null (an older server ignores it and sends values).
  const params = new URLSearchParams();
  if (key) params.set('key', key);
  if (opts.lite) params.set('lite', '1');
  const qs = params.toString() ? `?${params}` : '';
  const res = await req(`${BASE}/history${qs}`, { headers: headers() });
  if (!res.ok) throw new Error(`sync history: HTTP ${res.status}`);
  const body = (await res.json()) as { versions: SyncVersion[] };
  return body.versions ?? [];
}

/** Promote an archived version back to live, stamped now so it syncs everywhere. */
export async function remoteRestore(key: string, archivedAt: number): Promise<void> {
  if (!isSyncEnabled()) return;
  const res = await req(`${BASE}/restore`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ key, archivedAt }),
  });
  if (!res.ok) throw new Error(`sync restore ${key}: HTTP ${res.status}`);
}

/** One key whose value at the chosen moment differs from now. Sizes only, no values. */
export interface RestoreAtChange {
  key: string;
  thenBytes: number;
  /** null: the key no longer exists (it was deleted after the moment). */
  nowBytes: number | null;
  /** Server time of the first change after the moment. */
  changedAt: number;
  /** How many times it has changed since. */
  events: number;
}

/**
 * Point-in-time restore. `at` is server time in ms (archive stamps are server time).
 * `dryRun` lists what would change; otherwise restores `keys` (every changed key when
 * omitted). Keys created after `at` are kept, nothing is deleted, and the current
 * values are archived first, so the restore itself can be undone the same way.
 */
export async function remoteRestoreAt(
  at: number,
  opts: { dryRun?: boolean; keys?: string[] } = {},
): Promise<{ changes?: RestoreAtChange[]; restored?: number; updatedAt?: number }> {
  if (!isSyncEnabled()) throw new Error('sync is not enabled on this device');
  const res = await req(`${BASE}/restore-at`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ at, ...opts }),
  });
  // 404 from an older deploy: the route did not exist yet ("unknown route").
  if (res.status === 404) throw new Error('the server does not have restore-at yet — deploy the latest build');
  if (!res.ok) throw new Error(`sync restore-at: HTTP ${res.status}`);
  return (await res.json()) as { changes?: RestoreAtChange[]; restored?: number; updatedAt?: number };
}

/** Bulk download every entry (optionally only those newer than `since`). */
export async function remotePull(since = 0): Promise<SyncEntry[]> {
  if (!isSyncEnabled()) return [];
  const res = await req(`${BASE}/pull`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ since }),
  });
  if (!res.ok) throw new Error(`sync pull: HTTP ${res.status}`);
  const body = (await res.json()) as { entries: SyncEntry[] };
  return body.entries ?? [];
}

// ── User management (admins only) ────────────────────────────────────────────

/** One row of the admin list. There is no code in it: the server cannot read one back. */
export interface SyncUser {
  id: string;
  name: string | null;
  createdAt: string;
  keys: number;
  bytes: number;
  lastWrite: number | null;
  admin: boolean;
  you: boolean;
  /** What this user may view of the admin's data, or null when nothing is shared. */
  share?: { owner: string; pages: string[]; accounts: string[]; at: number } | null;
}

/** Who this code is, and whether it may manage users. `admins` false = SCANNER_ADMIN unset. */
export async function syncWhoami(): Promise<{ ok: boolean; id?: string; admin?: boolean; admins?: boolean; share?: ShareInfo | null; error?: string }> {
  if (!isSyncEnabled()) return { ok: false, error: 'sync is off' };
  try {
    const res = await req(`${BASE}/whoami`, { headers: headers() });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, ...((await res.json()) as { id?: string; admin?: boolean; admins?: boolean; share?: ShareInfo | null }) };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/** The server's own words on a refusal ("already exists", "not an admin") beat a status code. */
async function adminCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await req(`${BASE}/admin/${path}`, { ...init, headers: headers() });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export const adminListUsers = (): Promise<{ users: SyncUser[]; hashedNow: number; pages?: string[] }> => adminCall('users');

/** Let `id` view your data: these pages, these portfolio accounts. */
export const adminSetShare = (id: string, pages: string[], accounts: string[]): Promise<{ ok: boolean }> =>
  adminCall(`users/${encodeURIComponent(id)}/share`, { method: 'PUT', body: JSON.stringify({ pages, accounts }) });

export const adminClearShare = (id: string): Promise<{ ok: boolean }> =>
  adminCall(`users/${encodeURIComponent(id)}/share`, { method: 'DELETE' });

export const adminCreateUser = (id: string, name: string): Promise<{ id: string; name: string | null; code: string }> =>
  adminCall('users', { method: 'POST', body: JSON.stringify({ id, name }) });

/**
 * A new code for `id`; the old one stops working at once. Rotating your OWN code
 * would lock this device out on its next request, so the new code is stored here
 * before returning — every other device needs it typed in.
 */
export async function adminRotateCode(id: string): Promise<{ id: string; code: string; self: boolean }> {
  const r = await adminCall<{ id: string; code: string; self: boolean }>(`users/${encodeURIComponent(id)}/rotate`, { method: 'POST' });
  if (r.self) setSyncCode(r.code);
  return r;
}
