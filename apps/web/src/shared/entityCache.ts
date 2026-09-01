import { createListCache, type ListCache } from "./listCache";

export type EntityCache<T> = {
  peek: (id: string) => T | null;
  get: (id: string, opts?: { force?: boolean }) => Promise<T>;
  invalidate: (id: string) => void;
  prime: (id: string, data: T) => void;
};

export function createEntityCache<T>(opts: {
  storageKeyPrefix: string;
  fetch: (id: string) => Promise<T>;
  memoryTtlMs?: number;
  persistTtlMs?: number;
}): EntityCache<T> {
  const stores = new Map<string, ListCache<T>>();

  function storeFor(id: string): ListCache<T> {
    let store = stores.get(id);
    if (!store) {
      store = createListCache<T>({
        storageKey: `${opts.storageKeyPrefix}.${id}`,
        fetch: () => opts.fetch(id),
        memoryTtlMs: opts.memoryTtlMs ?? 20_000,
        persistTtlMs: opts.persistTtlMs ?? 10 * 60_000,
      });
      stores.set(id, store);
    }
    return store;
  }

  return {
    peek: (id) => storeFor(id).peek(),
    get: (id, options) => storeFor(id).get(options),
    invalidate: (id) => storeFor(id).invalidate(),
    prime: (id, data) => storeFor(id).seed(data),
  };
}
