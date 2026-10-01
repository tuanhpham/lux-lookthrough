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
//   GET    /api/sync/history[?key=][&lite=1] → { versions: [...] }  overwritten + deleted rows
//                                     (lite: sizes only, `value` null)
//   POST   /api/sync/restore        → body { key, archivedAt } → promote a version back
//   POST   /api/sync/restore-at     → body { at, keys?, dryRun? } → every key back to how it
//                                     was at server time `at` (a preview when dryRun)
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
  /** Runs the statements in one transaction: all of them apply, or none. */
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
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

// ── Collapse detection ───────────────────────────────────────────────────────
// MIRROR of `collapseVerdict` in packages/core/src/storage/syncMerge.ts, where it
// is unit-tested. Duplicated rather than imported because Pages Functions are
// bundled separately from the app and cannot resolve the workspace package. Keep
// the two in step; the core copy is the spec.
const COLLAPSE_RATIO = 0.5;
const COLLAPSE_MIN_BYTES = 200;

/** Why a write should be refused, or null if it is fine. Operates on the
 * SERIALISED values, so it is schema-agnostic and applies to every key. */
function collapseVerdict(prev: string, next: string): string | null {
  if (!prev || prev === next) return null;
  if (next.length >= prev.length) return null;
  if (prev.length < COLLAPSE_MIN_BYTES) return null;
  const kept = next.length / prev.length;
  if (kept > 1 - COLLAPSE_RATIO) return null;
  const dropped = Math.round((1 - kept) * 100);
  return `this write discards ${dropped}% of the stored value (${prev.length} → ${next.length} bytes)`;
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
    // `&lite=1` leaves the values out: 500 versions of a 40 KB portfolio is 20 MB, and a
    // caller that only wants to find the moment of a loss needs the sizes, not the data.
    if (head === 'history' && request.method === 'GET') {
      const url = new URL(request.url);
      const wanted = url.searchParams.get('key');
      const col = url.searchParams.get('lite') === '1' ? 'NULL' : 'value';
      const rows = await env.DB.prepare(
        `SELECT key, ${col} AS value, length(value) AS bytes, updated_at AS updatedAt, archived_at AS archivedAt, 'overwrite' AS how
           FROM kv_history WHERE user_id = ? AND (? IS NULL OR key = ?)
         UNION ALL
         SELECT key, ${col} AS value, length(value) AS bytes, updated_at AS updatedAt, deleted_at AS archivedAt, 'delete' AS how
           FROM kv_trash   WHERE user_id = ? AND (? IS NULL OR key = ?)
         ORDER BY archivedAt DESC LIMIT 500`,
      )
        .bind(user.id, wanted, wanted, user.id, wanted, wanted)
        .all<{ key: string; value: string | null; bytes: number; updatedAt: number; archivedAt: number; how: string }>();
      const versions = (rows.results ?? []).map((r) => ({
        key: r.key,
        value: r.value == null ? null : JSON.parse(r.value),
        updatedAt: r.updatedAt,
        archivedAt: r.archivedAt,
        how: r.how,
        // Rough size so a caller can eyeball "the big one" without downloading all.
        bytes: r.bytes,
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

    // ── restore-at: the whole account back to one moment ─────────────────────
    // Body { at, keys?, dryRun? }. `at` is SERVER time in ms — the clock that stamps
    // `archived_at` — so a device with a wrong clock cannot pick the wrong moment.
    //
    // A key's value at `at` is the value carried by its FIRST archive event after
    // `at` (an overwrite in kv_history or a delete in kv_trash): that row holds what
    // was live until then. A key with no event after `at` has not changed since, so
    // it is left alone — and that includes keys first written after `at`. Nothing is
    // ever deleted: a restore that removes data would be the bug it exists to undo.
    // (A key deleted and re-created after `at` with no overwrite in between comes back
    // as its pre-delete value; the trash cannot say it was absent, which is the safe
    // way round.)
    //
    // Not `kv.updated_at > at`: an identical rewrite bumps updated_at without
    // archiving anything, so "written after `at`" says nothing about "changed".
    //
    // dryRun → { changes: [{ key, thenBytes, nowBytes, changedAt, events }] }, sizes
    // only, never values (the accounts blob alone is tens of KB). Otherwise the
    // chosen keys (all changed ones when `keys` is absent) are restored in ONE
    // transaction: their current values are archived first, so the restore can itself
    // be undone by restoring to a moment just before it. Two statements total,
    // whatever the number of keys, which keeps well inside D1's per-call query cap.
    if (head === 'restore-at' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as
        | { at?: number; keys?: string[]; dryRun?: boolean }
        | null;
      const at = body?.at;
      if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || at > Date.now()) {
        return json({ error: 'need { at } as a past server time in ms' }, 400);
      }
      const then = `WITH ev AS (
          SELECT key, value, archived_at AS at FROM kv_history WHERE user_id = ?1 AND archived_at > ?2
          UNION ALL
          SELECT key, value, deleted_at AS at FROM kv_trash WHERE user_id = ?1 AND deleted_at > ?2
        ), pick AS (
          SELECT key, value, at, COUNT(*) OVER (PARTITION BY key) AS events,
                 ROW_NUMBER() OVER (PARTITION BY key ORDER BY at) AS rn
          FROM ev
        ), changed AS (
          SELECT p.key, p.value, p.at, p.events, k.value AS cur
          FROM pick p LEFT JOIN kv k ON k.user_id = ?1 AND k.key = p.key
          WHERE p.rn = 1 AND (k.value IS NULL OR k.value <> p.value)
        )`;
      if (body!.dryRun) {
        const rows = await env.DB.prepare(
          `${then} SELECT key, length(value) AS thenBytes, length(cur) AS nowBytes, at AS changedAt, events
             FROM changed ORDER BY key`,
        )
          .bind(user.id, at)
          .all<{ key: string; thenBytes: number; nowBytes: number | null; changedAt: number; events: number }>();
        return json({ at, changes: rows.results ?? [] });
      }
      // `json_each(?3)` is the chosen key list; NULL means every changed key.
      const keys = Array.isArray(body!.keys) ? JSON.stringify(body!.keys.map(String)) : null;
      const chosen = `(?3 IS NULL OR key IN (SELECT value FROM json_each(?3)))`;
      const now = Date.now();
      const archive = env.DB.prepare(
        `${then} INSERT INTO kv_history (user_id, key, value, updated_at, archived_at)
           SELECT user_id, key, value, updated_at, ?4 FROM kv
           WHERE user_id = ?1 AND key IN (SELECT key FROM changed WHERE ${chosen})`,
      ).bind(user.id, at, keys, now);
      // `WHERE` before ON CONFLICT is required: without it SQLite parses the ON as a
      // join constraint of the SELECT.
      const write = env.DB.prepare(
        `${then} INSERT INTO kv (user_id, key, value, updated_at)
           SELECT ?1, key, value, ?4 FROM changed WHERE ${chosen}
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(user.id, at, keys, now);
      const count = await env.DB.prepare(`${then} SELECT COUNT(*) AS n FROM changed WHERE ${chosen}`)
        .bind(user.id, at, keys)
        .first<{ n: number }>();
      await env.DB.batch([archive, write]);
      return json({ ok: true, at, restored: count?.n ?? 0, updatedAt: now });
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

        // ── Collapse guard: the last line of defence ─────────────────────────
        // Refuse a write that DESTROYS most of a row's content, unless the client
        // says it means to (`?allowShrink=1`).
        //
        // Timestamp-based rules cannot catch this, because the untrustworthy input
        // IS the timestamp — a fresh device honestly reports a newer clock. So this
        // guard ignores clocks and looks at the data: replacing 40 KB of portfolio
        // with a 300-byte starter account is not an edit, it is a wipe.
        //
        // Note an emptiness-only check would MISS the real incident: the starter
        // account is `[{account:…, lots:[]}]` — a one-element array, not `[]`.
        // Hence the size ratio, which catches both shapes.
        //
        // This is also what protects a Time Travel restore from being clobbered by
        // a device still running an old build before the fix is deployed.
        {
          const url = new URL(request.url);
          if (url.searchParams.get('allowShrink') !== '1') {
            const cur = await env.DB.prepare('SELECT value FROM kv WHERE user_id = ? AND key = ?')
              .bind(user.id, key)
              .first<{ value: string }>();
            const verdict = cur ? collapseVerdict(cur.value, nextValue) : null;
            if (verdict) {
              // 409, not 500: the client is wrong, not broken. Pushes are
              // best-effort and swallow errors, so this is silent and harmless —
              // and the local copy is untouched, so nothing is lost either way.
              return json(
                {
                  error: `refusing to overwrite: ${verdict}`,
                  key,
                  wasBytes: cur!.value.length,
                  nowBytes: nextValue.length,
                  hint: 'add ?allowShrink=1 if this deletion is deliberate',
                },
                409,
              );
            }
          }
        }

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
