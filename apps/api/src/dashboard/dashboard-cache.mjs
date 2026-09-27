/**
 * Short-lived in-process cache for dashboard aggregates so many viewers
 * refreshing the same period share one query.
 */

const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 500;

/** @type {Map<string, { expires: number, value: Promise<unknown> }>} */
const entries = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} load
 * @param {{ fresh?: boolean, ttlMs?: number }} [opts] fresh skips the cached value (refresh button / live events)
 * @returns {Promise<T>}
 */
export function cachedDashboard(key, load, opts = {}) {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const hit = entries.get(key);
  if (!opts.fresh && hit && hit.expires > now) return /** @type {Promise<T>} */ (hit.value);

  const value = load();
  entries.set(key, { expires: now + ttlMs, value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });

  if (entries.size > MAX_ENTRIES) {
    for (const [k, e] of entries) {
      if (e.expires <= now || entries.size > MAX_ENTRIES) entries.delete(k);
      if (entries.size <= MAX_ENTRIES) break;
    }
  }
  return value;
}

/** Drop cached aggregates (live events: new orders, bill changes). */
export function clearDashboardCache() {
  entries.clear();
}
