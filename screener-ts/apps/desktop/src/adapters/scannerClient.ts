/**
 * Read side of the scanner bridge (`/api/scanner`, table `scanner_kv`).
 *
 * Deliberately NOT part of syncClient. That client talks to `/api/sync`, whose
 * `kv` table is per-user portfolio data with a collapse guard and a history
 * trail. This one talks to a single shared table of scanner snapshots that the
 * Oracle VM overwrites wholesale — different owner, different table, different
 * failure modes. Sharing a module would only invite sharing the guard.
 *
 * The credential is the same access code the rest of the app already uses
 * (`x-sync-code`), which the endpoint resolves to the `reader` role: it may read
 * every `scanner:*` key and write only `scanner:config` / `scanner:commands`.
 * The VM's own `SCANNER_TOKEN` never enters the browser.
 */
import { getSyncCode, isSyncEnabled } from './syncClient.js';

const BASE = '/api/scanner';

export interface ScannerEntry {
  key: string;
  value: unknown;
  updatedAt: number;
}

function headers(): Record<string, string> {
  const code = getSyncCode();
  return {
    'content-type': 'application/json',
    ...(code ? { 'x-sync-code': code } : {}),
  };
}

/**
 * Every snapshot in one round trip: status, candidates, rejects, each day's
 * alerts. One request rather than four because the whole payload is a handful of
 * JSON blobs, and because four requests would each burn a D1 read on a free
 * plan that counts them.
 *
 * `since` is the server's own `now` from the previous call, so a poll that finds
 * nothing new returns an empty list. Never pass a locally computed timestamp:
 * the VM stamps rows with Cloudflare's clock, and a browser clock running a few
 * seconds fast would silently skip the newest snapshot forever.
 */
export async function scannerPull(since = 0): Promise<{ entries: ScannerEntry[]; now: number }> {
  if (!isSyncEnabled()) return { entries: [], now: 0 };
  const res = await fetch(`${BASE}/pull`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ since }),
  });
  if (!res.ok) throw new Error(`scanner pull: HTTP ${res.status}`);
  const body = (await res.json()) as { entries?: ScannerEntry[]; now?: number };
  return { entries: body.entries ?? [], now: body.now ?? 0 };
}

/**
 * Write one app-owned key. The endpoint's `mayWrite` accepts a reader only for
 * keys in its APP_KEYS set (`scanner:config`, `scanner:commands`,
 * `scanner:positions`) and answers 403 for anything else, so a typo here fails
 * with a message rather than corrupting a snapshot the VM owns.
 *
 * Returns false instead of throwing. Every caller is a side effect of something
 * the user actually asked for (saving the portfolio, editing config); none of
 * them may fail because a bridge is down or a sync code is not set yet.
 */
export async function scannerPut(key: string, value: unknown): Promise<boolean> {
  if (!isSyncEnabled()) return false;
  try {
    // encodeURI, not encodeURIComponent: every key contains ':' and the route
    // matches on the raw segment. syncClient.ts and push.py both send it raw.
    const res = await fetch(`${BASE}/kv/${encodeURI(key)}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
