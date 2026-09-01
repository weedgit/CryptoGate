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

function readCsv(name) {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Multi-network is on by default so all enabled registry pairs with open orders
 * (and configured RPC) are polled in one watcher process.
 * Set WATCHER_MULTI_NETWORK=false to pin ingest to DEFAULT_ASSET + DEFAULT_NETWORK only.
 */
function readMultiNetwork() {
  const raw = (process.env.WATCHER_MULTI_NETWORK ?? "true").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

export function loadWatcherConfig() {
  return {
    pollIntervalMs: readInt("WATCHER_POLL_INTERVAL_MS", 5000),
    defaultAsset: process.env.DEFAULT_ASSET ?? "USDT",
    defaultNetwork: process.env.DEFAULT_NETWORK ?? "tron",
    databaseUrl: process.env.DATABASE_URL ?? null,
    multiNetwork: readMultiNetwork(),
    /** Optional allow-list of network ids (e.g. tron,ethereum). Null = all. */
    networkAllowList: readCsv("WATCHER_NETWORKS"),
    /** Optional allow-list of assets (e.g. USDT,USDC). Null = all. */
    assetAllowList: readCsv("WATCHER_ASSETS"),
    /**
     * Per asset+network ingest hard cap (match + confirmations).
     * Chain HTTP also uses CHAIN_FETCH_TIMEOUT_MS (default 15s).
     */
    scopeTimeoutMs: readInt("WATCHER_SCOPE_TIMEOUT_MS", 60_000),
    /** Parallel confirmation RPCs per batch (one HTTP per verifying tx). */
    confirmConcurrency: readInt("WATCHER_CONFIRM_CONCURRENCY", 8),
    /** Parallel asset+network ingest scopes per tick. */
    scopeConcurrency: readInt("WATCHER_SCOPE_CONCURRENCY", 4),
  };
}

/**
 * Resolve which asset+network scopes to poll this tick.
 * @param {ReturnType<typeof loadWatcherConfig>} config
 * @param {Array<{ asset: string, network: string }>} openScopes from DB
 */
export function resolveWatchScopes(config, openScopes) {
  const fallback = {
    asset: config.defaultAsset,
    network: config.defaultNetwork,
  };

  /** @type {Array<{ asset: string, network: string }>} */
  let scopes;
  if (!config.multiNetwork) {
    scopes = [fallback];
  } else if (openScopes.length === 0) {
    scopes = [fallback];
  } else {
    const key = (s) => `${s.asset}:${s.network}`;
    const map = new Map(openScopes.map((s) => [key(s), s]));
    if (!map.has(key(fallback))) map.set(key(fallback), fallback);
    scopes = [...map.values()];
  }

  if (config.networkAllowList?.length) {
    const allow = new Set(config.networkAllowList);
    scopes = scopes.filter((s) => allow.has(s.network));
  }
  if (config.assetAllowList?.length) {
    const allow = new Set(config.assetAllowList);
    scopes = scopes.filter((s) => allow.has(s.asset));
  }

  if (scopes.length === 0) scopes = [fallback];

  scopes.sort((a, b) =>
    a.network === b.network
      ? a.asset.localeCompare(b.asset)
      : a.network.localeCompare(b.network),
  );
  return scopes;
}
