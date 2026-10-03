/**
 * User management on /api/sync/admin: only an admin reaches it, a code is shown
 * once and stored hashed, and a code still stored as typed keeps working until
 * its first sign-in rewrites it. A fake D1 answers the handful of queries used.
 */
import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/sync/[[path]].js';

interface Row { id: string; code: string; name: string | null; created_at: string }

function fakeDb(rows: Row[]) {
  const users = rows.map((r) => ({ ...r }));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => {
      if (sql.includes('WHERE code IN')) return users.find((u) => args.includes(u.code)) ?? null;
      if (sql.includes('FROM users WHERE id')) return users.find((u) => u.id === args[0]) ?? null;
      return null;
    },
    all: async () => {
      if (sql.includes("NOT LIKE 'h:%'")) return { results: users.filter((u) => !u.code.startsWith('h:')) };
      if (sql.includes('LEFT JOIN kv')) {
        return { results: users.map((u) => ({ id: u.id, name: u.name, createdAt: u.created_at, keys: 0, bytes: 0, lastWrite: null })) };
      }
      return { results: [] };
    },
    run: async () => {
      if (sql.startsWith('UPDATE users')) users.find((u) => u.id === args[1])!.code = String(args[0]);
      if (sql.startsWith('INSERT INTO users')) users.push({ id: String(args[0]), code: String(args[1]), name: args[2] as string | null, created_at: 'now' });
      return {};
    },
  });
  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: { run: () => Promise<unknown> }[]) => Promise.all(list.map((s) => s.run())),
  };
  return { db, users };
}

async function call(env: Record<string, unknown>, method: string, path: string, code: string, body?: unknown) {
  const request = new Request(`https://x/api/sync/${path}`, {
    method,
    headers: { 'x-sync-code': code, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await onRequest({ request, params: { path: path.split('/') }, env: env as never });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const seed = (): Row[] => [
  { id: 'Ad', code: 'typed-secret', name: 'Me', created_at: '2026-01-01' },
  { id: 'bo', code: 'other-secret', name: 'Bo', created_at: '2026-02-01' },
];

describe('/api/sync/admin', () => {
  it('rewrites a typed code to its hash on sign-in, and the code still works after', async () => {
    const { db, users } = fakeDb(seed());
    const r = await call({ DB: db }, 'GET', 'whoami', 'typed-secret');
    expect(r.body).toMatchObject({ ok: true, id: 'Ad', admin: false });
    expect(users[0]!.code).toMatch(/^h:[0-9a-f]{64}$/);
    expect((await call({ DB: db }, 'GET', 'whoami', 'typed-secret')).status).toBe(200);
  });

  it('is closed without SCANNER_ADMIN, and to anyone not in it', async () => {
    const { db } = fakeDb(seed());
    expect((await call({ DB: db }, 'GET', 'admin/users', 'typed-secret')).status).toBe(403);
    expect((await call({ DB: db, SCANNER_ADMIN: 'Ad' }, 'GET', 'admin/users', 'other-secret')).status).toBe(403);
  });

  it('lists users without any code, hashing the rows a sign-in has not reached', async () => {
    const { db, users } = fakeDb(seed());
    const r = await call({ DB: db, SCANNER_ADMIN: 'Ad' }, 'GET', 'admin/users', 'typed-secret');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/secret|h:/);
    expect(r.body.hashedNow).toBe(1);
    expect(users.every((u) => u.code.startsWith('h:'))).toBe(true);
    expect(r.body.users).toMatchObject([{ id: 'Ad', admin: true, you: true }, { id: 'bo', admin: false, you: false }]);
  });

  it('creates a user whose code is returned once and stored only as a hash', async () => {
    const { db, users } = fakeDb(seed());
    const env = { DB: db, SCANNER_ADMIN: 'Ad' };
    const r = await call(env, 'POST', 'admin/users', 'typed-secret', { id: 'cu', name: 'Cu' });
    expect(r.status).toBe(200);
    const code = String(r.body.code);
    expect(code).toMatch(/^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/);
    expect(users.find((u) => u.id === 'cu')!.code).not.toContain(code);
    expect((await call(env, 'GET', 'whoami', code)).body).toMatchObject({ id: 'cu' });
    expect((await call(env, 'POST', 'admin/users', 'typed-secret', { id: 'cu' })).status).toBe(409);
    expect((await call(env, 'POST', 'admin/users', 'typed-secret', { id: 'a b' })).status).toBe(400);
  });

  it('rotating a code kills the old one at once', async () => {
    const { db } = fakeDb(seed());
    const env = { DB: db, SCANNER_ADMIN: 'Ad' };
    const r = await call(env, 'POST', 'admin/users/bo/rotate', 'typed-secret');
    expect(r.body).toMatchObject({ id: 'bo', self: false });
    expect((await call(env, 'GET', 'whoami', 'other-secret')).status).toBe(401);
    expect((await call(env, 'GET', 'whoami', String(r.body.code))).body).toMatchObject({ id: 'bo' });
    expect((await call(env, 'POST', 'admin/users/nobody/rotate', 'typed-secret')).status).toBe(404);
  });
});
