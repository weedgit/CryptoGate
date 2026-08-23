/**
 * Watcher env config. No imports from apps/api.
 */

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return n;
}

export function loadWatcherConfig() {
  return {
    pollIntervalMs: readInt("WATCHER_POLL_INTERVAL_MS", 5000),
    defaultAsset: process.env.DEFAULT_ASSET ?? "USDT",
    defaultNetwork: process.env.DEFAULT_NETWORK ?? "tron",
    databaseUrl: process.env.DATABASE_URL ?? null,
  };
}
