// Cloudflare Pages Function: snapshot bridge for the Python scanner on the
// Oracle VM (repo: github.com/tuanhpham/scanner).
//
// WHY THIS IS NOT /api/sync
// -------------------------
// The obvious move is to reuse the sync function's `kv` table. Three reasons not
// to, each of which would bite silently:
//
//  1. The collapse guard. /api/sync refuses a write that shrinks a value by more
//     than 50% (COLLAPSE_MIN_BYTES / COLLAPSE_RATIO) because for portfolios and
//     watchlists a big shrink means a buggy client is wiping real data. For the
//     scanner the exact opposite holds: `candidates` legitimately drops from 400
//     symbols to 30 when the market falls, and yesterday's snapshot is worth
//     nothing. Under /api/sync those days would 409 and the tab would quietly
//     show stale data — the pusher swallows errors, so nobody would notice.
//  2. `kv` rows are keyed by (user_id, key) and FK to `users`. Scanner data
//     belongs to a machine, not a person; every reader must see the same rows.
//  3. Blast radius. The VM holds a long-lived token in a .env on a box exposed
//     to the internet. It must not be able to touch portfolio data, and it does
//     not need history/trash — a lost snapshot is replaced 60 seconds later.
//
// So: separate table `scanner_kv`, separate credential, no undo machinery.
//
// IDENTITY — two roles, deliberately asymmetric
// ---------------------------------------------
//   writer  header `X-Scanner-Token` == env.SCANNER_TOKEN   (the VM)
//   reader  header `X-Sync-Code`     resolves in `users`    (the app / you)
//
// SINGLE WRITER PER KEY
// ---------------------
// Both roles can write, but never the same key. Keys in APP_KEYS (config,
// commands) are writable ONLY by a reader; everything else ONLY by the writer.
// Neither side ever reads-modifies-writes the other's key, so a lost update is
// not possible and no locking is needed. Command *results* come back on a
// separate key the VM owns (`scanner:command_results`).
//
// ROUTES (all under /api/scanner)
//   GET    /api/scanner/ping            → { ok, role, keys }
//   GET    /api/scanner/kv              → { keys: [...] }        (?prefix=)
//   GET    /api/scanner/kv/<key>        → { value, updatedAt } | 404
//   PUT    /api/scanner/kv/<key>        → body { value } → upsert
//   DELETE /api/scanner/kv/<key>        → 204                    (writer only)
//   POST   /api/scanner/pull            → body { since? } → { entries: [...] }
//
// SETUP
//   wrangler d1 execute screener-sync --file=./schema.sql --remote
//   wrangler pages secret put SCANNER_TOKEN --project-name the-professional

interface D1Result<T = unknown> {
  results?: T[];
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(col?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB: D1Database;
  SCANNER_TOKEN?: string;
}
interface Ctx {
  request: Request;
  params: { path?: string[] };
  env: Env;
}

// `no-store` is not optional here. This data is minutes old at best, and the
// repo has already lost a day to Cloudflare caching a stable URL (see
// public/_headers). A cached /api/scanner response looks exactly like a dead
// scanner.
const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-sync-code, x-scanner-token',
  'cache-control': 'no-store',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Keys the APP owns. The VM is refused on these; it only reads them. */
const APP_KEYS = new Set(['scanner:config', 'scanner:commands']);

// Everything lives under one prefix so a leaked writer token cannot reach
// anything else, and so `pull` can hand the tab the whole world in one request.
const KEY_RE = /^scanner:[A-Za-z0-9:_.-]{1,80}$/;

// A candidates snapshot with 500 symbols is ~80 KB. 512 KB leaves room to grow
// while still failing loudly if something starts pushing raw bars by mistake.
const MAX_BYTES = 512_000;

type Role = 'writer' | 'reader';

/** Constant-time string compare. `a === b` on a secret leaks its length and a
 *  prefix through timing; this is cheap enough not to think about. */
function tokenEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function resolveRole(env: Env, request: Request): Promise<Role | null> {
  const tok = request.headers.get('x-scanner-token')?.trim();
  if (tok && env.SCANNER_TOKEN && tokenEq(tok, env.SCANNER_TOKEN)) return 'writer';

  const code = request.headers.get('x-sync-code')?.trim();
  if (code) {
    const row = await env.DB.prepare('SELECT id FROM users WHERE code = ?')
      .bind(code)
      .first<{ id: string }>();
    if (row) return 'reader';
  }
  return null;
}

/** null = allowed, string = why not. */
function mayWrite(role: Role, key: string): string | null {
  const appOwned = APP_KEYS.has(key);
  if (appOwned && role !== 'reader') {
    return `${key} is written by the app only; the scanner reads it`;
  }
  if (!appOwned && role !== 'writer') {
    return `${key} is written by the scanner only`;
  }
  return null;
}

export const onRequestOptions = async (): Promise<Response> =>
  new Response(null, { status: 204, headers: JSON_HEADERS });

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: 'scanner bridge not configured (no D1 binding)' }, 503);

  const segments = ctx.params.path ?? [];
  const head = segments[0] ?? '';

  const role = await resolveRole(env, request);
  if (!role) return json({ error: 'invalid or missing credential' }, 401);

  try {
    if (head === 'ping') {
      // Cheap liveness + "is my token actually right" check. `keys` makes a
      // curl from the VM enough to tell configured-but-empty from working.
      const rows = await env.DB.prepare(
        'SELECT COUNT(*) AS n, MAX(updated_at) AS newest FROM scanner_kv',
      ).first<{ n: number; newest: number | null }>();
      return json({ ok: true, role, keys: rows?.n ?? 0, newest: rows?.newest ?? null });
    }

    // Bulk read: the tab wants status + candidates + rejects + today's alerts in
    // one round trip, and `since` lets a poll return an empty body when nothing
    // moved. Values are re-parsed here so the client gets objects, not strings.
    if (head === 'pull' && request.method === 'POST') {
      const { since = 0 } = (await request.json().catch(() => ({}))) as { since?: number };
      const rows = await env.DB.prepare(
        'SELECT key, value, updated_at AS updatedAt FROM scanner_kv WHERE updated_at > ? ORDER BY key',
      )
        .bind(since)
        .all<{ key: string; value: string; updatedAt: number }>();
      const entries = (rows.results ?? []).map((r) => ({
        key: r.key,
        value: JSON.parse(r.value),
        updatedAt: r.updatedAt,
      }));
      return json({ entries, now: Date.now() });
    }

    if (head === 'kv') {
      const key = segments.slice(1).join('/'); // keys contain ':'

      if (!key) {
        if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
        const prefix = new URL(request.url).searchParams.get('prefix') ?? '';
        const rows = await env.DB.prepare(
          'SELECT key, updated_at AS updatedAt, LENGTH(value) AS bytes FROM scanner_kv'
            + ' WHERE key LIKE ? ORDER BY key',
        )
          .bind(prefix + '%')
          .all<{ key: string; updatedAt: number; bytes: number }>();
        return json({ keys: rows.results ?? [] });
      }

      if (!KEY_RE.test(key)) {
        return json({ error: `key must match ${KEY_RE}`, key }, 400);
      }

      if (request.method === 'GET') {
        const row = await env.DB.prepare(
          'SELECT value, updated_at AS updatedAt FROM scanner_kv WHERE key = ?',
        )
          .bind(key)
          .first<{ value: string; updatedAt: number }>();
        if (!row) return json({ error: 'not found', key }, 404);
        return json({ value: JSON.parse(row.value), updatedAt: row.updatedAt });
      }

      if (request.method === 'PUT') {
        const denied = mayWrite(role, key);
        if (denied) return json({ error: denied, key }, 403);

        const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
        if (!body || !('value' in body)) return json({ error: 'missing value' }, 400);
        const value = JSON.stringify(body.value);
        if (value.length > MAX_BYTES) {
          return json(
            { error: 'value too large', key, bytes: value.length, max: MAX_BYTES },
            413,
          );
        }

        // Unconditional overwrite. No timestamp comparison, because there is
        // exactly one writer per key and the newest snapshot is always the one
        // that matters — an older one arriving late is worthless, not a
        // conflict. No history table either: see the header note.
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO scanner_kv (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
          .bind(key, value, now)
          .run();
        return json({ ok: true, key, updatedAt: now, bytes: value.length });
      }

      if (request.method === 'DELETE') {
        // The VM prunes its own old per-day keys (scanner:alerts:2026-09-01…).
        // Without this they accumulate forever inside the D1 free storage tier.
        const denied = mayWrite(role, key);
        if (denied) return json({ error: denied, key }, 403);
        await env.DB.prepare('DELETE FROM scanner_kv WHERE key = ?').bind(key).run();
        return new Response(null, { status: 204, headers: JSON_HEADERS });
      }

      return json({ error: 'method not allowed' }, 405);
    }

    return json({ error: 'unknown route' }, 404);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
};
