import { describe, it, expect } from 'vitest';
import { TTLCache } from '../src/data/cache.js';
import { MemoryStorage } from '../src/storage/Storage.js';

describe('TTLCache', () => {
  it('expires entries past the TTL using the injected clock', () => {
    let t = 1000;
    const c = new TTLCache<number>(500, () => t);
    c.set('a', 42);
    expect(c.get('a')).toBe(42);
    t = 1400; // within TTL
    expect(c.get('a')).toBe(42);
    t = 1600; // past TTL
    expect(c.get('a')).toBeUndefined();
  });
});

describe('MemoryStorage', () => {
  it('round-trips, lists by prefix, and deletes', async () => {
    const s = new MemoryStorage();
    await s.set('account:1', { name: 'A' });
    await s.set('account:2', { name: 'B' });
    await s.set('post:1', { title: 'x' });
    expect(await s.get('account:1')).toEqual({ name: 'A' });
    expect((await s.list('account:')).sort()).toEqual(['account:1', 'account:2']);
    await s.delete('account:1');
    expect(await s.get('account:1')).toBeNull();
  });
});
