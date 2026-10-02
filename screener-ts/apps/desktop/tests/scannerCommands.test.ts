/**
 * `scanner:commands` is the one key that makes the VM do something, so the
 * function — not just the VM — must refuse anything that is not an admin sending
 * a whitelisted command. A fake D1 stands in for the database.
 */
import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/scanner/[[path]].js';

function fakeDb(users: Record<string, string>) {
  const kv = new Map<string, { value: string; updated_at: number }>();
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => {
      if (sql.includes('FROM users')) {
        const id = users[String(args[0])];
        return id ? { id } : null;
      }
      if (sql.includes('COUNT(*)')) return { n: kv.size, newest: null };
      const row = kv.get(String(args[0]));
      return row ? { value: row.value, updatedAt: row.updated_at } : null;
    },
    all: async () => ({ results: [] }),
    run: async () => {
      if (sql.startsWith('INSERT')) kv.set(String(args[0]), { value: String(args[1]), updated_at: Number(args[2]) });
      return {};
    },
  });
  return { db: { prepare: (sql: string) => stmt(sql) }, kv };
}

async function call(env: Record<string, unknown>, method: string, path: string, code: string, body?: unknown) {
  const request = new Request(`https://x/api/scanner/${path}`, {
    method,
    headers: { 'x-sync-code': code, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await onRequest({ request, params: { path: path.split('/') }, env: env as never });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const put = (env: Record<string, unknown>, code: string, value: unknown) =>
  call(env, 'PUT', 'kv/scanner:commands', code, { value });

describe('scanner:commands', () => {
  it('is off for everyone while SCANNER_ADMIN is unset', async () => {
    const { db } = fakeDb({ c1: 'u1' });
    const r = await put({ DB: db }, 'c1', { id: 'abc12345', cmd: 'status' });
    expect(r.status).toBe(403);
    const ping = await call({ DB: db }, 'GET', 'ping', 'c1');
    expect(ping.body).toMatchObject({ you: 'u1', admin: false, commands: false });
  });

  it('refuses a reader who is not in the admin list', async () => {
    const { db } = fakeDb({ c1: 'u1', c2: 'u2' });
    const r = await put({ DB: db, SCANNER_ADMIN: 'u1' }, 'c2', { id: 'abc12345', cmd: 'status' });
    expect(r.status).toBe(403);
  });

  it('stores only the whitelisted fields, stamped by the server', async () => {
    const { db, kv } = fakeDb({ c1: 'u1' });
    const env = { DB: db, SCANNER_ADMIN: 'u0, u1' };
    const r = await put(env, 'c1', { id: 'abc12345', cmd: 'log', arg: 'prep', shell: 'rm -rf /' });
    expect(r.status).toBe(200);
    const stored = JSON.parse(kv.get('scanner:commands')!.value);
    expect(stored).toMatchObject({ id: 'abc12345', cmd: 'log', arg: 'prep', by: 'u1' });
    expect(stored.shell).toBeUndefined();
    expect(typeof stored.at).toBe('number');
  });

  it('rejects unknown commands, bad ids and stray arguments', async () => {
    const { db, kv } = fakeDb({ c1: 'u1' });
    const env = { DB: db, SCANNER_ADMIN: 'u1' };
    expect((await put(env, 'c1', { id: 'abc12345', cmd: 'bash' })).status).toBe(400);
    expect((await put(env, 'c1', { id: 'a b', cmd: 'status' })).status).toBe(400);
    expect((await put(env, 'c1', { id: 'abc12345', cmd: 'log', arg: '../.env' })).status).toBe(400);
    expect((await put(env, 'c1', { id: 'abc12345', cmd: 'push', arg: '--force' })).status).toBe(400);
    expect(kv.size).toBe(0);
  });
});
