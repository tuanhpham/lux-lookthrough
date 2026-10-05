/**
 * Sharing (CHAT-102): an admin grants another user a read-only VIEW of the admin's data, limited
 * to pages and portfolio accounts. Enforced on the server: the shared pull filters, a viewer
 * cannot write, and the `__share` grant cannot be written or read through kv.
 */
import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/sync/[[path]].js';

interface User { id: string; code: string; name: string | null; created_at: string }
interface Kv { user_id: string; key: string; value: string; updated_at: number }

function fakeDb(users: User[], kv: Kv[]) {
  const stmt = (sql: string, a: unknown[] = []) => ({
    bind: (...b: unknown[]) => stmt(sql, b),
    first: async () => {
      if (sql.includes('WHERE code IN')) return users.find((u) => a.includes(u.code)) ?? null;
      if (sql.includes('SELECT name FROM users WHERE id')) return users.find((u) => u.id === a[0]) ?? null;
      if (sql.includes('FROM users WHERE id')) return users.find((u) => u.id === a[0]) ?? null;
      if (sql.startsWith('SELECT value FROM kv WHERE user_id = ? AND key = ?')) return kv.find((r) => r.user_id === a[0] && r.key === a[1]) ?? null;
      return null;
    },
    all: async () => {
      if (sql.includes("NOT LIKE 'h:%'")) return { results: [] };
      if (sql.includes('LEFT JOIN kv')) return { results: users.map((u) => ({ id: u.id, name: u.name, createdAt: u.created_at, keys: kv.filter((r) => r.user_id === u.id).length, bytes: 0, lastWrite: null })) };
      if (sql.startsWith('SELECT user_id AS id, value FROM kv WHERE key = ?')) return { results: kv.filter((r) => r.key === a[0]).map((r) => ({ id: r.user_id, value: r.value })) };
      if (sql.includes('FROM kv WHERE user_id = ? ORDER BY key')) return { results: kv.filter((r) => r.user_id === a[0]).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at })) };
      if (sql.includes('FROM kv WHERE user_id = ? AND updated_at > ?')) return { results: kv.filter((r) => r.user_id === a[0] && !r.key.startsWith('__')).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at })) };
      return { results: [] };
    },
    run: async () => {
      if (sql.startsWith('UPDATE users')) users.find((u) => u.id === a[1])!.code = String(a[0]);
      if (sql.trim().startsWith('INSERT INTO kv (')) {
        const i = kv.findIndex((r) => r.user_id === a[0] && r.key === a[1]);
        const row = { user_id: String(a[0]), key: String(a[1]), value: String(a[2]), updated_at: Number(a[3]) };
        if (i >= 0) kv[i] = row; else kv.push(row);
      }
      if (sql.startsWith('DELETE FROM kv WHERE user_id = ? AND key = ?')) {
        const i = kv.findIndex((r) => r.user_id === a[0] && r.key === a[1]);
        if (i >= 0) kv.splice(i, 1);
      }
      return {};
    },
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (l: { run: () => Promise<unknown> }[]) => Promise.all(l.map((s) => s.run())) };
}

async function call(env: Record<string, unknown>, method: string, path: string, code: string, body?: unknown) {
  const request = new Request(`https://x/api/sync/${path}`, {
    method, headers: { 'x-sync-code': code, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await onRequest({ request, params: { path: path.split('/') }, env: env as never });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const accounts = [
  { account: { id: 'tr', name: 'TR' }, lots: [{ id: 'L1' }] },
  { account: { id: 'dg', name: 'Degiro' }, lots: [{ id: 'L2' }] },
];
function world() {
  const users: User[] = [
    { id: 'Ad', code: 'admin-code', name: 'Me', created_at: '2026-01-01' },
    { id: 'bo', code: 'bo-code', name: 'Bo', created_at: '2026-02-01' },
  ];
  const kv: Kv[] = [
    { user_id: 'Ad', key: 'accounts', value: JSON.stringify(accounts), updated_at: 1 },
    { user_id: 'Ad', key: 'wealth', value: '{"accounts":[]}', updated_at: 1 },
    { user_id: 'Ad', key: 'llm_config', value: '{"provider":"x"}', updated_at: 1 },
    { user_id: 'Ad', key: 'plansnap:L1', value: '{"a":1}', updated_at: 1 },
    { user_id: 'Ad', key: 'plansnap:L2', value: '{"a":2}', updated_at: 1 },
    { user_id: 'Ad', key: 'casestudy:c1', value: '{"accountId":"tr"}', updated_at: 1 },
    { user_id: 'Ad', key: 'casestudy:c2', value: '{"accountId":"dg"}', updated_at: 1 },
    { user_id: 'Ad', key: 'casestudy:c3', value: '{}', updated_at: 1 },
    { user_id: 'Ad', key: 'casestudies:index', value: '[{"id":"c1"},{"id":"c2"},{"id":"c3"}]', updated_at: 1 },
    { user_id: 'bo', key: 'watchlists:index', value: '[]', updated_at: 1 },
  ];
  return { env: { DB: fakeDb(users, kv), SCANNER_ADMIN: 'Ad' }, kv };
}

describe('sharing a read-only view', () => {
  it('only an admin grants, never to themselves, and at least one page', async () => {
    const { env } = world();
    expect((await call(env, 'PUT', 'admin/users/bo/share', 'bo-code', { pages: ['portfolio'] })).status).toBe(403);
    expect((await call(env, 'PUT', 'admin/users/Ad/share', 'admin-code', { pages: ['portfolio'] })).status).toBe(400);
    expect((await call(env, 'PUT', 'admin/users/bo/share', 'admin-code', { pages: [] })).status).toBe(400);
  });

  it('sends only the granted pages and accounts, and their studies and frozen plans', async () => {
    const { env } = world();
    await call(env, 'PUT', 'admin/users/bo/share', 'admin-code', { pages: ['portfolio', 'casestudies', 'bogus'], accounts: ['tr'] });
    const who = await call(env, 'GET', 'whoami', 'bo-code');
    expect(who.body.share).toMatchObject({ owner: 'Ad', ownerName: 'Me', pages: ['portfolio', 'casestudies'], accounts: ['tr'] });
    const r = await call(env, 'POST', 'shared/pull', 'bo-code', {});
    expect(r.status).toBe(200);
    const e = Object.fromEntries((r.body.entries as { key: string; value: unknown }[]).map((x) => [x.key, x.value]));
    expect(Object.keys(e).sort()).toEqual(['accounts', 'casestudies:index', 'casestudy:c1', 'casestudy:c3', 'plansnap:L1']);
    expect((e.accounts as { account: { id: string } }[]).map((a) => a.account.id)).toEqual(['tr']);
    expect(e['casestudies:index']).toEqual([{ id: 'c1' }, { id: 'c3' }]);
  });

  it('refuses a viewer’s writes, keeps the grant out of kv, and stops when the grant goes', async () => {
    const { env, kv } = world();
    await call(env, 'PUT', 'admin/users/bo/share', 'admin-code', { pages: ['wealth'], accounts: [] });
    expect((await call(env, 'PUT', 'kv/watchlists:index', 'bo-code', { value: [1], updatedAt: 9 })).status).toBe(403);
    expect((await call(env, 'PUT', 'kv/__share', 'admin-code', { value: {}, updatedAt: 9 })).status).toBe(403);
    expect((await call(env, 'GET', 'kv/__share', 'bo-code')).status).toBe(404);
    const own = await call(env, 'POST', 'pull', 'bo-code', {});
    expect((own.body.entries as { key: string }[]).map((x) => x.key)).toEqual(['watchlists:index']);
    const list = await call(env, 'GET', 'admin/users', 'admin-code');
    expect((list.body.users as { id: string; share: unknown }[]).find((u) => u.id === 'bo')!.share).toMatchObject({ pages: ['wealth'] });
    await call(env, 'DELETE', 'admin/users/bo/share', 'admin-code');
    expect(kv.some((r) => r.key === '__share')).toBe(false);
    expect((await call(env, 'POST', 'shared/pull', 'bo-code', {})).status).toBe(403);
  });
});
