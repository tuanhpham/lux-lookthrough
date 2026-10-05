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
//   GET    /api/sync/admin/users    → { users: [...], hashedNow }   (admins only, never a code)
//   POST   /api/sync/admin/users    → body { id, name? } → { id, name, code }  new user
//   POST   /api/sync/admin/users/<id>/rotate → { id, code, self }  new code, old one dead
//   PUT    /api/sync/admin/users/<id>/share  → body { pages, accounts } → let <id> VIEW your data
//   DELETE /api/sync/admin/users/<id>/share  → stop sharing
//   POST   /api/sync/shared/pull     → { owner, ownerName, pages, accounts, entries } (viewers only)
//
// ── SHARING: A READ-ONLY VIEW OF THE ADMIN'S DATA (CHAT-102) ──────────────────
// The user's "khi tao user moi … phan quyen … xem duoc certain pages … nhung accounts ho khong
// duoc xem". Every user owns separate kv rows, so a permission means something only with a
// shared view: the admin grants a user a VIEW of the admin's own data, limited to chosen pages
// and chosen portfolio accounts. The grant is a kv row of the VIEWER, key `__share` — no schema
// change — which only the admin routes write: keys starting `__` are refused on PUT/DELETE and
// left out of the viewer's own pull and list. Everything is enforced HERE, not in the app: the
// shared pull sends only the keys the granted pages read, `accounts` filtered to the granted
// account ids, and case studies / frozen plans that belong to other accounts are dropped. A
// viewer's own writes are refused (403), so a viewing device can never push the admin's data
// into the viewer's rows or alter anything.
//
// Codes are stored as `h:` + SHA-256, never as typed. A row still holding a typed
// code is rewritten the first time it signs in (and by the admin list), so the
// switch needs no migration step. A new code is shown ONCE, in the response that
// made it; nothing can read it back afterwards — not the admin, not the database.
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
  /** Comma-separated `users.id` values who may manage users (and send VM commands). */
  SCANNER_ADMIN?: string;
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

// ── Codes ────────────────────────────────────────────────────────────────────
// MIRROR of codeHash in functions/api/scanner/[[path]].ts (Pages Functions here
// import nothing). Unsalted on purpose: the hash IS the lookup key. Codes made
// below carry ~99 random bits, so that is not the weak point.
async function codeHash(code: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  return 'h:' + Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** No 0/o, 1/l/i: a code is read off one screen and typed into another. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** 20 characters in groups of five. Rejection sampling (b < 248 = 8 × 31) keeps it unbiased. */
function newCode(): string {
  const out: string[] = [];
  while (out.length < 20) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < 248 && out.length < 20) out.push(CODE_ALPHABET[b % 31]!);
    }
  }
  return out.join('').replace(/(.{5})(?=.)/g, '$1-');
}

// ── Sharing rules ──────────────────────────────────────────────────────────────
// MIRROR of `SHARE_KEYS` in src/adapters/viewer.ts (the app uses it to know what to expect).
const SHARE_KEY = '__share';
interface Share { owner: string; pages: string[]; accounts: string[]; at: number }

/** Which of the owner's keys each page reads. Anything not listed is never sent. */
const PAGE_KEYS: Record<string, readonly (string | RegExp)[]> = {
  portfolio: ['accounts', 'pf_playbook_cfg', 'broker_fees', 'plan_symbols', /^plan:/, /^plansnap:/],
  station: ['accounts', 'pf_playbook_cfg', 'broker_fees', 'plan_symbols', /^plan:/, /^plansnap:/, 'casestudies:index', /^casestudy:/, 'watchlists:index', /^watchlists:items:/],
  casestudies: ['casestudies:index', /^casestudy:/, /^plansnap:/, 'pf_playbook_cfg', 'accounts'],
  wealth: ['wealth', 'wealth_sort', 'wealth_ccy', 'accounts'],
  watchlist: ['watchlists:index', /^watchlists:items:/, 'alerts:config'],
  calendar: ['calendar:custom', 'watchlists:index', /^watchlists:items:/, 'accounts'],
  learn: ['playbook:prompts', 'playbook:routine', 'pf_playbook_cfg'],
  picks: [/^scan:/], screener: [/^scan:/], sectors: [/^scan:/],
};
const SHARE_PAGES = ['calendar', 'picks', 'screener', 'sectors', 'scanner', 'watchlist', 'station', 'portfolio', 'casestudies', 'wealth', 'backtest', 'learn', 'about'];

function keyAllowed(key: string, pages: readonly string[]): boolean {
  if (key.startsWith('__') || key.startsWith('sync:')) return false;
  return pages.some((p) => (PAGE_KEYS[p] ?? []).some((m) => (typeof m === 'string' ? m === key : m.test(key))));
}

async function shareOf(env: Env, userId: string): Promise<Share | null> {
  const row = await env.DB.prepare('SELECT value FROM kv WHERE user_id = ? AND key = ?').bind(userId, SHARE_KEY).first<{ value: string }>();
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as Share;
    return v && typeof v.owner === 'string' && Array.isArray(v.pages) && Array.isArray(v.accounts) ? v : null;
  } catch {
    return null;
  }
}

/** The owner's rows a viewer may see, already filtered. */
async function sharedEntries(env: Env, share: Share): Promise<{ key: string; value: unknown; updatedAt: number }[]> {
  const rows = await env.DB.prepare('SELECT key, value, updated_at AS updatedAt FROM kv WHERE user_id = ? ORDER BY key')
    .bind(share.owner)
    .all<{ key: string; value: string; updatedAt: number }>();
  const accts = new Set(share.accounts);
  const all = (rows.results ?? []).filter((r) => keyAllowed(r.key, share.pages));
  const parsed = all.map((r) => ({ key: r.key, value: JSON.parse(r.value) as unknown, updatedAt: r.updatedAt }));
  // The granted accounts, and the lots they hold: what frozen plans and studies may belong to.
  const acctRow = parsed.find((e) => e.key === 'accounts');
  const lots = new Set<string>();
  if (acctRow && Array.isArray(acctRow.value)) {
    acctRow.value = (acctRow.value as { account?: { id?: string }; lots?: { id?: string }[] }[])
      .filter((a) => a?.account?.id && accts.has(a.account.id));
    for (const a of acctRow.value as { lots?: { id?: string }[] }[]) for (const l of a.lots ?? []) if (l.id) lots.add(l.id);
  }
  const hiddenStudies = new Set<string>();
  const out = parsed.filter((e) => {
    if (e.key.startsWith('plansnap:')) return lots.has(e.key.slice('plansnap:'.length));
    if (e.key.startsWith('casestudy:')) {
      const st = e.value as { accountId?: string; lotIds?: string[] } | null;
      const ok = !st?.accountId || accts.has(st.accountId);
      if (!ok) hiddenStudies.add(e.key.slice('casestudy:'.length));
      return ok;
    }
    return true;
  });
  const idx = out.find((e) => e.key === 'casestudies:index');
  if (idx && Array.isArray(idx.value)) idx.value = (idx.value as { id?: string }[]).filter((m) => !m?.id || !hiddenStudies.has(m.id));
  return out;
}

function isAdmin(env: Env, userId: string): boolean {
  if (!env.SCANNER_ADMIN) return false;
  return env.SCANNER_ADMIN.split(',').map((s) => s.trim()).filter(Boolean).includes(userId);
}

const USER_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

async function resolveUser(env: Env, request: Request): Promise<{ id: string; name: string | null } | null> {
  const code = request.headers.get('x-sync-code')?.trim();
  if (!code) return null;
  const hashed = await codeHash(code);
  const row = await env.DB.prepare('SELECT id, name, code FROM users WHERE code IN (?, ?)')
    .bind(hashed, code)
    .first<{ id: string; name: string | null; code: string }>();
  if (!row) return null;
  // Still stored as typed: replace it with the hash now that we have seen it work.
  if (row.code !== hashed) await env.DB.prepare('UPDATE users SET code = ? WHERE id = ?').bind(hashed, row.id).run();
  return { id: row.id, name: row.name };
}

/** /api/sync/admin/… — the caller is already a known user; this checks they are an admin. */
async function adminRoute(env: Env, request: Request, user: { id: string }, segments: string[]): Promise<Response> {
  if (!env.SCANNER_ADMIN) return json({ error: 'user management is off: SCANNER_ADMIN is not set' }, 403);
  if (!isAdmin(env, user.id)) return json({ error: 'this sync code is not an admin' }, 403);
  if (segments[1] !== 'users') return json({ error: 'not found' }, 404);
  const target = segments[2];

  if (!target && request.method === 'GET') {
    // Any row a sign-in has not reached yet is hashed here, so the list is also the migration.
    const plain = await env.DB.prepare("SELECT id, code FROM users WHERE code NOT LIKE 'h:%'").all<{ id: string; code: string }>();
    const todo = plain.results ?? [];
    if (todo.length) {
      const ups = await Promise.all(
        todo.map(async (r) => env.DB.prepare('UPDATE users SET code = ? WHERE id = ?').bind(await codeHash(r.code), r.id)),
      );
      await env.DB.batch(ups);
    }
    const rows = await env.DB.prepare(
      `SELECT u.id, u.name, u.created_at AS createdAt, COUNT(k.key) AS keys,
              COALESCE(SUM(LENGTH(k.value)), 0) AS bytes, MAX(k.updated_at) AS lastWrite
         FROM users u LEFT JOIN kv k ON k.user_id = u.id
        GROUP BY u.id ORDER BY u.created_at`,
    ).all<{ id: string; name: string | null; createdAt: string; keys: number; bytes: number; lastWrite: number | null }>();
    const shares = await env.DB.prepare('SELECT user_id AS id, value FROM kv WHERE key = ?').bind(SHARE_KEY).all<{ id: string; value: string }>();
    const shareBy = new Map((shares.results ?? []).map((r) => {
      try { return [r.id, JSON.parse(r.value) as Share] as const; } catch { return [r.id, null] as const; }
    }));
    const users = (rows.results ?? []).map((r) => ({
      ...r,
      // The grant's own row is not "their data": keep it out of the counts.
      ...(shareBy.has(r.id) ? { keys: Math.max(0, r.keys - 1) } : {}),
      admin: isAdmin(env, r.id), you: r.id === user.id, share: shareBy.get(r.id) ?? null,
    }));
    return json({ users, hashedNow: todo.length, pages: SHARE_PAGES });
  }

  if (!target && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { id?: unknown; name?: unknown };
    const id = String(body.id ?? '').trim();
    const name = String(body.name ?? '').trim().slice(0, 60) || null;
    if (!USER_ID_RE.test(id)) return json({ error: 'id: 1-32 letters, digits, _ or -' }, 400);
    const taken = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (taken) return json({ error: `user ${id} already exists` }, 409);
    const code = newCode();
    await env.DB.prepare('INSERT INTO users (id, code, name) VALUES (?, ?, ?)').bind(id, await codeHash(code), name).run();
    return json({ id, name, code });
  }

  if (target && segments[3] === 'rotate' && request.method === 'POST') {
    const found = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(target).first();
    if (!found) return json({ error: `no user ${target}` }, 404);
    const code = newCode();
    await env.DB.prepare('UPDATE users SET code = ? WHERE id = ?').bind(await codeHash(code), target).run();
    return json({ id: target, code, self: target === user.id });
  }

  if (target && segments[3] === 'share' && (request.method === 'PUT' || request.method === 'DELETE')) {
    if (target === user.id) return json({ error: 'you cannot share with yourself' }, 400);
    if (isAdmin(env, target)) return json({ error: 'an admin sees their own data; sharing is for other users' }, 400);
    const found = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(target).first();
    if (!found) return json({ error: `no user ${target}` }, 404);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM kv WHERE user_id = ? AND key = ?').bind(target, SHARE_KEY).run();
      return json({ ok: true, share: null });
    }
    const body = (await request.json().catch(() => ({}))) as { pages?: unknown; accounts?: unknown };
    const pages = (Array.isArray(body.pages) ? body.pages : []).map(String).filter((p) => SHARE_PAGES.includes(p));
    const accounts = (Array.isArray(body.accounts) ? body.accounts : []).map(String).filter((a) => /^[\w:.-]{1,80}$/.test(a)).slice(0, 100);
    if (!pages.length) return json({ error: 'pick at least one page' }, 400);
    const share: Share = { owner: user.id, pages, accounts, at: Date.now() };
    await env.DB.prepare(
      `INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(target, SHARE_KEY, JSON.stringify(share), share.at).run();
    return json({ ok: true, share });
  }

  return json({ error: 'not found' }, 404);
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
    const share = await shareOf(env, user.id);
    if (head === 'whoami') {
      const ownerName = share
        ? (await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(share.owner).first<{ name: string | null }>())?.name ?? null
        : null;
      return json({
        ok: true, name: user.name, id: user.id, admin: isAdmin(env, user.id), admins: !!env.SCANNER_ADMIN,
        share: share ? { owner: share.owner, ownerName, pages: share.pages, accounts: share.accounts } : null,
      });
    }

    if (head === 'admin') return await adminRoute(env, request, user, segments);

    // ── a viewer: the owner's data, filtered; nothing of their own is written ──
    if (head === 'shared' && segments[1] === 'pull' && request.method === 'POST') {
      if (!share) return json({ error: 'nothing is shared with this sync code' }, 403);
      const ownerName = (await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(share.owner).first<{ name: string | null }>())?.name ?? null;
      return json({ owner: share.owner, ownerName, pages: share.pages, accounts: share.accounts, entries: await sharedEntries(env, share) });
    }
    if (share && (request.method === 'PUT' || request.method === 'DELETE' || head === 'restore' || head === 'restore-at')) {
      return json({ error: 'read-only: this sync code views shared data' }, 403);
    }

    // ── bulk pull (merge-on-startup) ──────────────────────────────────────────
    if (head === 'pull' && request.method === 'POST') {
      const { since = 0 } = (await request.json().catch(() => ({}))) as { since?: number };
      const rows = await env.DB.prepare(
        "SELECT key, value, updated_at AS updatedAt FROM kv WHERE user_id = ? AND updated_at > ? AND key NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY key",
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
      // `__…` keys are the server's own (the share grant): nobody writes them through kv.
      if (key.startsWith('__') && request.method !== 'GET') return json({ error: 'reserved key' }, 403);
      if (key.startsWith('__') && request.method === 'GET') return json({ error: 'not found' }, 404);

      // List keys (optionally by prefix) when no specific key is given.
      if (!key) {
        if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
        const url = new URL(request.url);
        const prefix = url.searchParams.get('prefix') ?? '';
        const rows = await env.DB.prepare(
          "SELECT key FROM kv WHERE user_id = ? AND key LIKE ? AND key NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY key",
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
