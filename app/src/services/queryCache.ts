import type { Result } from './result';

export function createQueryCache<T>(ttlMs = 60_000) {
  const entries = new Map<string, { expiresAt: number; promise: Promise<Result<T>> }>();

  return {
    get(key: string, load: () => Promise<Result<T>>): Promise<Result<T>> {
      const cached = entries.get(key);
      if (cached && Date.now() < cached.expiresAt) return cached.promise;

      const entry = { expiresAt: Infinity, promise: Promise.resolve().then(load) };
      entries.set(key, entry);
      void entry.promise.then((result) => {
        if (entries.get(key) !== entry) return;
        if (result.ok) entry.expiresAt = Date.now() + ttlMs;
        else entries.delete(key);
      }, () => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return entry.promise;
    },
    clear() {
      entries.clear();
    },
  };
}