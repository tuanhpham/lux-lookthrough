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
    const res = await fetch(`${BASE}/whoami`, { headers: { 'x-sync-code': code.trim() } });
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
  const res = await fetch(`${BASE}/kv/${encodeURI(key)}`, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sync get ${key}: HTTP ${res.status}`);
  return (await res.json()) as { value: T; updatedAt: number };
}

/** Upsert one key with a last-write-wins timestamp. */
export async function remotePut<T>(key: string, value: T, updatedAt: number): Promise<void> {
  if (!isSyncEnabled()) return;
  const res = await fetch(`${BASE}/kv/${encodeURI(key)}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ value, updatedAt }),
  });
  if (!res.ok) throw new Error(`sync put ${key}: HTTP ${res.status}`);
}

export async function remoteDelete(key: string): Promise<void> {
  if (!isSyncEnabled()) return;
  const res = await fetch(`${BASE}/kv/${encodeURI(key)}`, { method: 'DELETE', headers: headers() });
  if (!res.ok && res.status !== 404) throw new Error(`sync delete ${key}: HTTP ${res.status}`);
}

export async function remoteList(prefix = ''): Promise<string[]> {
  if (!isSyncEnabled()) return [];
  const res = await fetch(`${BASE}/kv?prefix=${encodeURIComponent(prefix)}`, { headers: headers() });
  if (!res.ok) throw new Error(`sync list: HTTP ${res.status}`);
  const body = (await res.json()) as { keys: string[] };
  return body.keys ?? [];
}

/** Bulk download every entry (optionally only those newer than `since`). */
export async function remotePull(since = 0): Promise<SyncEntry[]> {
  if (!isSyncEnabled()) return [];
  const res = await fetch(`${BASE}/pull`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ since }),
  });
  if (!res.ok) throw new Error(`sync pull: HTTP ${res.status}`);
  const body = (await res.json()) as { entries: SyncEntry[] };
  return body.entries ?? [];
}
