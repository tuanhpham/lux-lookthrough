// Cloudflare Pages Function: cross-device sync backed by D1.
//
// Identity: every request must carry an `X-Sync-Code` header (the user's secret
// access code). We resolve it to a user id; an unknown/missing code → 401. There
// is no public sign-up — codes are issued manually (see schema.sql / deploy notes).
//
// Routes (all under /api/sync):
//   GET    /api/sync/whoami         → { ok, name } if the code is valid
//   GET    /api/sync/kv             → { keys: [...] }            (optional ?prefix=)
//   GET    /api/sync/kv/<key>       → { value, updatedAt } | 404
//   PUT    /api/sync/kv/<key>       → body { value, updatedAt } → upsert (last-write-wins)
//   DELETE /api/sync/kv/<key>       → 204
//   POST   /api/sync/pull           → body { since? } → { entries: [{key,value,updatedAt}] }
//                                     (bulk download for merge-on-startup)
//   GET    /api/sync/history[?key=] → { versions: [...] }  overwritten + deleted rows
//   POST   /api/sync/restore        → body { key, archivedAt } → promote a version back
//
// `key` may contain ':' and '/', so we re-join the wildcard path segments after
// the "kv" prefix and treat the remainder as the full key.
//
// WHY history/trash exist: sync is last-write-wins on a CLIENT-SUPPLIED
// timestamp, so a freshly-installed device always reports a "newer" write than
// months-old real data. The client has guards (see storage.ts), but the server
// cannot distinguish a legitimate new edit from a first-boot default — so it
// stops throwing the old value away. Overwrites go to `kv_history`, deletes to
// `kv_trash`, and both are restorable.

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
}
interface Ctx {
  request: Request;
  params: { path?: string[] };
  env: Env;
}

const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-sync-code',
  'cache-control': 'no-store',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function resolveUser(env: Env, request: Request): Promise<{ id: string; name: string | null } | null> {
  const code = request.headers.get('x-sync-code')?.trim();
  if (!code) return null;
  const row = await env.DB.prepare('SELECT id, name FROM users WHERE code = ?')
    .bind(code)
    .first<{ id: string; name: string | null }>();
  return row ?? null;
}

// CORS preflight.
export const onRequestOptions = async (): Promise<Response> =>
  new Response(null, { status: 204, headers: JSON_HEADERS });

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const { request, env } = ctx;
  if (!env.DB) return json({ error: 'sync not configured (no D1 binding)' }, 503);

  const segments = ctx.params.path ?? [];
  const head = segments[0] ?? '';

  const user = await resolveUser(env, request);
  if (!user) return json({ error: 'invalid or missing access code' }, 401);

  try {
    // ── whoami ──────────────────────────────────────────────────────────────
    if (head === 'whoami') {
      return json({ ok: true, name: user.name });
    }

    // ── bulk pull (merge-on-startup) ──────────────────────────────────────────
    if (head === 'pull' && request.method === 'POST') {
      const { since = 0 } = (await request.json().catch(() => ({}))) as { since?: number };
      const rows = await env.DB.prepare(
        'SELECT key, value, updated_at AS updatedAt FROM kv WHERE user_id = ? AND updated_at > ? ORDER BY key',
      )
        .bind(user.id, since)
        .all<{ key: string; value: string; updatedAt: number }>();
      const entries = (rows.results ?? []).map((r) => ({
        key: r.key,
        value: JSON.parse(r.value),
        updatedAt: r.updatedAt,
      }));
      return json({ entries });
    }

    // ── history: every archived version, newest first ────────────────────────
    // Recovery surface for the data-loss class of bug. `?key=` narrows to one key.
    if (head === 'history' && request.method === 'GET') {
      const url = new URL(request.url);
      const wanted = url.searchParams.get('key');
      const rows = await env.DB.prepare(
        `SELECT key, value, updated_at AS updatedAt, archived_at AS archivedAt, 'overwrite' AS how
           FROM kv_history WHERE user_id = ? AND (? IS NULL OR key = ?)
         UNION ALL
         SELECT key, value, updated_at AS updatedAt, deleted_at AS archivedAt, 'delete' AS how
           FROM kv_trash   WHERE user_id = ? AND (? IS NULL OR key = ?)
         ORDER BY archivedAt DESC LIMIT 500`,
      )
        .bind(user.id, wanted, wanted, user.id, wanted, wanted)
        .all<{ key: string; value: string; updatedAt: number; archivedAt: number; how: string }>();
      const versions = (rows.results ?? []).map((r) => ({
        key: r.key,
        value: JSON.parse(r.value),
        updatedAt: r.updatedAt,
        archivedAt: r.archivedAt,
        how: r.how,
        // Rough size so a caller can eyeball "the big one" without downloading all.
        bytes: r.value.length,
      }));
      return json({ versions });
    }

    // ── restore: promote an archived version back into kv ────────────────────
    // Body { key, archivedAt } — the pair identifies one row in history/trash.
    // Restores with a fresh timestamp so it beats whatever is live and syncs out.
    if (head === 'restore' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as
        | { key?: string; archivedAt?: number }
        | null;
      if (!body?.key || typeof body.archivedAt !== 'number') {
        return json({ error: 'need { key, archivedAt }' }, 400);
      }
      const row = await env.DB.prepare(
        `SELECT value FROM kv_history WHERE user_id = ? AND key = ? AND archived_at = ?
         UNION ALL
         SELECT value FROM kv_trash  WHERE user_id = ? AND key = ? AND deleted_at = ?
         LIMIT 1`,
      )
        .bind(user.id, body.key, body.archivedAt, user.id, body.key, body.archivedAt)
        .first<{ value: string }>();
      if (!row) return json({ error: 'no such archived version' }, 404);
      const now = Date.now();
      // Archive what we are replacing too — restoring must itself be undoable.
      await env.DB.prepare(
        `INSERT INTO kv_history (user_id, key, value, updated_at, archived_at)
         SELECT user_id, key, value, updated_at, ? FROM kv WHERE user_id = ? AND key = ?`,
      )
        .bind(now, user.id, body.key)
        .run();
      await env.DB.prepare(
        `INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
        .bind(user.id, body.key, row.value, now)
        .run();
      return json({ ok: true, key: body.key, updatedAt: now });
    }

    // ── key/value ─────────────────────────────────────────────────────────────
    if (head === 'kv') {
      const key = segments.slice(1).join('/'); // re-join: keys contain ':' and '/'

      // List keys (optionally by prefix) when no specific key is given.
      if (!key) {
        if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
        const url = new URL(request.url);
        const prefix = url.searchParams.get('prefix') ?? '';
        const rows = await env.DB.prepare(
          'SELECT key FROM kv WHERE user_id = ? AND key LIKE ? ORDER BY key',
        )
          .bind(user.id, prefix + '%')
          .all<{ key: string }>();
        return json({ keys: (rows.results ?? []).map((r) => r.key) });
      }

      if (request.method === 'GET') {
        const row = await env.DB.prepare(
          'SELECT value, updated_at AS updatedAt FROM kv WHERE user_id = ? AND key = ?',
        )
          .bind(user.id, key)
          .first<{ value: string; updatedAt: number }>();
        if (!row) return json({ error: 'not found' }, 404);
        return json({ value: JSON.parse(row.value), updatedAt: row.updatedAt });
      }

      if (request.method === 'PUT') {
        const body = (await request.json().catch(() => null)) as
          | { value: unknown; updatedAt?: number }
          | null;
        if (!body || !('value' in body)) return json({ error: 'missing value' }, 400);
        const updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : 0;
        const nextValue = JSON.stringify(body.value);

        // Archive the CURRENT value before overwriting it, but only when the write
        // actually changes something. Last-write-wins on a client clock cannot be
        // made safe on the server alone — a fresh device legitimately reports a
        // newer timestamp than the real data. So the server keeps the previous
        // versions instead, which turns "wiped" into "restorable" (see /history
        // and /restore below). This is the backstop for the client-side guards.
        await env.DB.prepare(
          `INSERT INTO kv_history (user_id, key, value, updated_at, archived_at)
           SELECT user_id, key, value, updated_at, ? FROM kv
           WHERE user_id = ? AND key = ? AND value <> ? AND ? >= updated_at`,
        )
          .bind(Date.now(), user.id, key, nextValue, updatedAt)
          .run();

        await env.DB.prepare(
          `INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at
           WHERE excluded.updated_at >= kv.updated_at`,
        )
          .bind(user.id, key, nextValue, updatedAt)
          .run();
        return json({ ok: true, updatedAt });
      }

      if (request.method === 'DELETE') {
        // Keep the row's last value in the trash before removing it. A delete
        // used to be permanent and unguarded, so one buggy client wiped data with
        // no way back. `kv_trash` makes it recoverable via /restore.
        await env.DB.prepare(
          `INSERT INTO kv_trash (user_id, key, value, updated_at, deleted_at)
           SELECT user_id, key, value, updated_at, ? FROM kv
           WHERE user_id = ? AND key = ?`,
        )
          .bind(Date.now(), user.id, key)
          .run();
        await env.DB.prepare('DELETE FROM kv WHERE user_id = ? AND key = ?')
          .bind(user.id, key)
          .run();
        return new Response(null, { status: 204, headers: JSON_HEADERS });
      }

      return json({ error: 'method not allowed' }, 405);
    }

    return json({ error: 'unknown route' }, 404);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
};
