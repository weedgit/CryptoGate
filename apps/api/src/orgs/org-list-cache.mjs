/** @type {{ rows: object[] | null, expiresAt: number }} */
const cache = { rows: null, expiresAt: 0 };

const TTL_MS = 30_000;

/**
 * Short-lived cache for platform-wide org list (full table scan).
 * @param {() => Promise<object[]>} loader
 */
export async function cachedPlatformOrgList(loader) {
  const now = Date.now();
  if (cache.rows && cache.expiresAt > now) return cache.rows;
  const rows = await loader();
  cache.rows = rows;
  cache.expiresAt = now + TTL_MS;
  return rows;
}

export function invalidatePlatformOrgListCache() {
  cache.rows = null;
  cache.expiresAt = 0;
}
