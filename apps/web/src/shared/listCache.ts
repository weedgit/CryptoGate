import {
  clearPersistedCache,
  readPersistedCache,
  writePersistedCache,
} from "./persistedCache";

export type ListCache<T> = {
  peek: () => T | null;
  get: (opts?: { force?: boolean }) => Promise<T>;
  invalidate: () => void;
};

type ListCacheOptions<T> = {
  storageKey: string;
  fetch: () => Promise<T>;
  memoryTtlMs?: number;
  persistTtlMs?: number;
};

export function createListCache<T>(opts: ListCacheOptions<T>): ListCache<T> {
  const memoryTtlMs = opts.memoryTtlMs ?? 30_000;
  const persistTtlMs = opts.persistTtlMs ?? 30 * 60_000;

  let cached: T | null = null;
  let cachedAt = 0;
  let inflight: Promise<T> | null = null;

  function hydrateFromStorage(): void {
    if (cached != null) return;
    const stored = readPersistedCache<T>(opts.storageKey, persistTtlMs);
    if (stored != null) {
      cached = stored;
      // Mark stale so the next get() revalidates in the background.
      cachedAt = Date.now() - memoryTtlMs;
    }
  }

  hydrateFromStorage();

  function persist(data: T): void {
    writePersistedCache(opts.storageKey, data);
  }

  function invalidate(): void {
    cached = null;
    cachedAt = 0;
    inflight = null;
    clearPersistedCache(opts.storageKey);
  }

  function peek(): T | null {
    return cached;
  }

  function refresh(): Promise<T> {
    if (inflight) return inflight;
    inflight = opts
      .fetch()
      .then((data) => {
        cached = data;
        cachedAt = Date.now();
        persist(data);
        inflight = null;
        return data;
      })
      .catch((err) => {
        inflight = null;
        throw err;
      });
    return inflight;
  }

  async function get(options?: { force?: boolean }): Promise<T> {
    hydrateFromStorage();
    const now = Date.now();
    const fresh = cached != null && now - cachedAt < memoryTtlMs;

    if (!options?.force && fresh) {
      return cached!;
    }

    if (!options?.force && cached != null) {
      void refresh().catch(() => {
        /* keep serving stale on background failure */
      });
      return cached;
    }

    return refresh();
  }

  return { peek, get, invalidate };
}
