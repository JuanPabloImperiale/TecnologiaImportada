import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryCache } from './queryCache';
import { fail, ok, type Result } from './result';

afterEach(() => vi.useRealTimers());

describe('createQueryCache', () => {
  it('shares in-flight queries and reuses successful results until expiration', async () => {
    vi.useFakeTimers();
    const cache = createQueryCache<number>();
    const load = vi.fn(async () => ok(42));
    const first = cache.get('products', load);
    expect(cache.get('products', load)).toBe(first);
    await first;
    vi.advanceTimersByTime(59_999);
    await cache.get('products', load);
    expect(load).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await cache.get('products', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps queries with different filters independent', async () => {
    const cache = createQueryCache<number>();
    const load = vi.fn(async () => ok(42));
    await cache.get('products', load);
    await cache.get('accessories', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed or rejected queries', async () => {
    const cache = createQueryCache<number>();
    const load = vi.fn(async () => ok(42));
    await cache.get('products', async () => fail('red', 'Sin conexión'));
    await expect(cache.get('products', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(await cache.get('products', load)).toEqual(ok(42));
    expect(load).toHaveBeenCalledOnce();
  });

  it('invalidates pending results without letting stale responses repopulate the cache', async () => {
    const cache = createQueryCache<number>();
    let resolve!: (value: Result<number>) => void;
    const pending = cache.get('products', () => new Promise((done) => { resolve = done; }));
    await Promise.resolve();
    cache.clear();
    const load = vi.fn(async () => ok(2));
    await cache.get('products', load);
    resolve(ok(1));
    await pending;
    expect(await cache.get('products', load)).toEqual(ok(2));
    expect(load).toHaveBeenCalledOnce();
  });
});