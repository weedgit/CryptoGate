/**
 * Build B16 network catalog cards from domain registry + maintenance + watcher heartbeats.
 */
import { listAssetNetworkRegistry, NetworkId, resolveChainEnvironment } from "@paymentgate/domain";
import { listNetworkMaintenanceRows } from "./network-maintenance-store.mjs";
import { isMaintenanceEffective } from "./network-maintenance-rules.mjs";
import { listWatcherHeartbeats } from "../ops/watcher-health-store.mjs";
import { computeOrderabilityLamp } from "./network-lamp.mjs";
import { resolveRailPolicy, registryNetworkFloors } from "./network-rail-settings-rules.mjs";
import { loadPlatformRailOverlays, pairKey } from "./network-rail-resolve.mjs";

const NETWORK_TITLE = {
  [NetworkId.Ethereum]: "Ethereum",
  [NetworkId.Tron]: "TRON",
  [NetworkId.TronNile]: "TRON Nile",
  [NetworkId.Solana]: "Solana",
};

/**
 * Prefer USDT as the primary display pair, else first enabled, else first row.
 * @param {import("@paymentgate/domain").AssetNetworkConfig[]} rows
 */
function pickPrimary(rows) {
  const enabled = rows.filter((r) => r.enabled);
  return (
    enabled.find((r) => r.asset === "USDT") ??
    enabled[0] ??
    rows.find((r) => r.asset === "USDT") ??
    rows[0]
  );
}

/**
 * @param {Awaited<ReturnType<typeof listWatcherHeartbeats>>[number] | undefined} hb
 */
function ingestFromHeartbeat(hb) {
  if (!hb) {
    return {
      ingestStatus: "unknown",
      ingestLabel: "No heartbeat",
      rpcConfigured: false,
      rpcMode: null,
      healthScore: null,
      lagMs: null,
      tickAt: null,
      openOrders: 0,
    };
  }
  const stub = /stub/i.test(hb.rpcMode) || /stub/i.test(hb.ingestMode);
  let ingestStatus = "live";
  let ingestLabel = "Live ingest";
  if (hb.status === "down") {
    ingestStatus = "down";
    ingestLabel = "Watcher down";
  } else if (stub || !hb.rpcOk) {
    ingestStatus = "stub";
    ingestLabel = hb.rpcOk ? "Stub (RPC empty)" : "RPC not ready";
  } else if (hb.status === "degraded") {
    ingestStatus = "degraded";
    ingestLabel = "Degraded";
  }
  return {
    ingestStatus,
    ingestLabel,
    rpcConfigured: Boolean(hb.rpcOk) && !stub,
    rpcMode: hb.rpcMode,
    healthScore: hb.healthScore,
    lagMs: hb.lagMs,
    tickAt: hb.tickAt,
    openOrders: hb.openOrders,
  };
}

/** @type {{ payload: object | null, expiresAt: number }} */
const catalogCache = { payload: null, expiresAt: 0 };

const CATALOG_TTL_MS = 20_000;

/** Drop in-memory catalog so the next build reflects maintenance / heartbeat changes. */
export function invalidateNetworkCatalogCache() {
  catalogCache.payload = null;
  catalogCache.expiresAt = 0;
}

/** Missing table / optional enrichment — still return registry cards. */
function isOptionalCatalogDbError(err, tableHint) {
  const message = err instanceof Error ? err.message : String(err);
  return (
    new RegExp(tableHint, "i").test(message) ||
    /does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /password authentication failed/i.test(message) ||
    /connection refused|ECONNREFUSED|ETIMEDOUT/i.test(message) ||
    /DATABASE_URL is required/i.test(message)
  );
}

function buildRegistryOnlyCatalog() {
  const chainEnv = resolveChainEnvironment();
  const registry = listAssetNetworkRegistry(chainEnv);
  const byNet = new Map();
  for (const row of registry) {
    const list = byNet.get(row.network) ?? [];
    list.push(row);
    byNet.set(row.network, list);
  }

  const items = [];
  for (const [network, rows] of byNet) {
    const enabledPairs = rows.filter((r) => r.enabled);
    const primary = pickPrimary(rows);
    const floors = registryNetworkFloors(network);
    const ingest = ingestFromHeartbeat(undefined);
    let status = "catalogued";
    if (enabledPairs.length > 0) status = "active";
    const lamp = computeOrderabilityLamp({
      enabled: enabledPairs.length > 0,
      maintenanceActive: false,
      ingestStatus: ingest.ingestStatus,
    });
    const primaryResolved = primary
      ? resolveRailPolicy(primary.asset, primary.network, {})
      : null;
    items.push({
      network,
      title: NETWORK_TITLE[network] || network.replace(/_/g, " "),
      status,
      lamp,
      pairCount: rows.length,
      enabledCount: enabledPairs.length,
      catalogFraction: rows.length > 0 ? enabledPairs.length / rows.length : 0,
      primaryAsset: primary?.asset ?? null,
      confirmations: primaryResolved?.requiredConfirmations ?? null,
      minAmount: primaryResolved?.minAmount ?? null,
      registryConfirmations: floors.requiredConfirmations,
      registryMinAmount: floors.minAmount,
      railOverride: {
        requiredConfirmations: null,
        minAmount: null,
      },
      contractAddress: primary?.contractAddress ?? null,
      pairs: rows.map((r) => {
        const resolved = resolveRailPolicy(r.asset, r.network, {}) ?? r;
        return {
          asset: r.asset,
          enabled: r.enabled,
          contractAddress: r.contractAddress,
          decimals: r.decimals,
          minAmount: resolved.minAmount,
          requiredConfirmations: resolved.requiredConfirmations,
          displayNetwork: r.displayNetwork,
          lamp: computeOrderabilityLamp({
            enabled: r.enabled,
            maintenanceActive: false,
            ingestStatus: ingest.ingestStatus,
          }),
        };
      }),
      maintenance: {
        active: false,
        message: null,
        startedAt: null,
        endsAt: null,
        updatedAt: null,
      },
      ingest,
    });
  }

  items.sort((a, b) => a.title.localeCompare(b.title));
  return {
    chainEnv,
    checkedAt: new Date().toISOString(),
    items,
  };
}

/**
 * @returns {Promise<{
 *   chainEnv: string,
 *   checkedAt: string,
 *   items: object[],
 * }>}
 */
export async function buildNetworkCatalog() {
  const now = Date.now();
  if (catalogCache.payload && catalogCache.expiresAt > now) {
    return catalogCache.payload;
  }
  try {
    const payload = await buildNetworkCatalogFresh();
    catalogCache.payload = payload;
    catalogCache.expiresAt = now + CATALOG_TTL_MS;
    return payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[network-catalog] registry-only fallback:", message);
    const payload = buildRegistryOnlyCatalog();
    catalogCache.payload = payload;
    catalogCache.expiresAt = now + CATALOG_TTL_MS;
    return payload;
  }
}

async function buildNetworkCatalogFresh() {
  const chainEnv = resolveChainEnvironment();
  const registry = listAssetNetworkRegistry(chainEnv);
  const byNet = new Map();
  for (const row of registry) {
    const list = byNet.get(row.network) ?? [];
    list.push(row);
    byNet.set(row.network, list);
  }

  let maintenanceRows = [];
  let heartbeats = [];
  /** @type {{ confirmsByNet: Map<string, number | null>, minByPair: Map<string, string> }} */
  let railOverlays = { confirmsByNet: new Map(), minByPair: new Map() };
  try {
    maintenanceRows = await listNetworkMaintenanceRows();
  } catch (err) {
    if (!isOptionalCatalogDbError(err, "network_maintenance")) throw err;
  }
  try {
    heartbeats = await listWatcherHeartbeats();
  } catch (err) {
    if (!isOptionalCatalogDbError(err, "watcher_heartbeats")) throw err;
  }
  try {
    railOverlays = await loadPlatformRailOverlays();
  } catch (err) {
    if (
      !isOptionalCatalogDbError(err, "platform_network_rail_settings") &&
      !isOptionalCatalogDbError(err, "platform_pair_rail_settings")
    ) {
      throw err;
    }
  }

  const maintByNet = new Map(maintenanceRows.map((m) => [m.network, m]));
  const hbByNet = new Map(heartbeats.map((h) => [h.network, h]));

  const items = [];
  for (const [network, rows] of byNet) {
    const enabledPairs = rows.filter((r) => r.enabled);
    const primary = pickPrimary(rows);
    const floors = registryNetworkFloors(network);
    const netConfirms = railOverlays.confirmsByNet.get(network) ?? null;
    const maint = maintByNet.get(network) ?? null;
    const underMaintenance = isMaintenanceEffective(maint);
    // Heartbeats are keyed by watcher network id (tron covers Nile ingest today).
    const hb =
      hbByNet.get(network) ??
      (network === NetworkId.TronNile ? hbByNet.get(NetworkId.Tron) : undefined);
    const ingest = ingestFromHeartbeat(hb);

    let status = "catalogued";
    if (underMaintenance) status = "maintenance";
    else if (enabledPairs.length > 0) status = "active";

    const lamp = computeOrderabilityLamp({
      enabled: enabledPairs.length > 0,
      maintenanceActive: underMaintenance,
      ingestStatus: ingest.ingestStatus,
    });

    const pairs = rows.map((r) => {
      const pairLamp = computeOrderabilityLamp({
        enabled: r.enabled,
        maintenanceActive: underMaintenance,
        ingestStatus: ingest.ingestStatus,
      });
      const pairMin = railOverlays.minByPair.get(pairKey(network, r.asset)) ?? null;
      const resolved =
        resolveRailPolicy(r.asset, r.network, {
          platform: {
            requiredConfirmations: netConfirms,
            minAmount: pairMin,
          },
        }) ?? r;
      return {
        asset: r.asset,
        enabled: r.enabled,
        contractAddress: r.contractAddress,
        decimals: r.decimals,
        minAmount: resolved.minAmount,
        registryMinAmount: r.minAmount,
        minAmountOverride: pairMin,
        requiredConfirmations: resolved.requiredConfirmations,
        displayNetwork: r.displayNetwork,
        lamp: pairLamp,
      };
    });

    const primaryResolved = primary
      ? pairs.find((p) => p.asset === primary.asset) ?? null
      : null;

    items.push({
      network,
      title: NETWORK_TITLE[network] || network.replace(/_/g, " "),
      status,
      lamp,
      pairCount: rows.length,
      enabledCount: enabledPairs.length,
      catalogFraction:
        rows.length > 0 ? enabledPairs.length / rows.length : 0,
      primaryAsset: primary?.asset ?? null,
      confirmations: primaryResolved?.requiredConfirmations ?? null,
      minAmount: primaryResolved?.minAmount ?? null,
      registryConfirmations: floors.requiredConfirmations,
      registryMinAmount: floors.minAmount,
      railOverride: {
        requiredConfirmations: netConfirms,
        minAmount: primaryResolved?.minAmountOverride ?? null,
      },
      contractAddress: primary?.contractAddress ?? null,
      pairs,
      maintenance: {
        active: underMaintenance,
        message: underMaintenance ? (maint?.message ?? null) : null,
        startedAt: underMaintenance ? (maint?.startedAt ?? null) : null,
        endsAt: underMaintenance ? (maint?.endsAt ?? null) : null,
        updatedAt: maint?.updatedAt ?? null,
      },
      ingest,
    });
  }

  items.sort((a, b) => a.title.localeCompare(b.title));

  return {
    chainEnv,
    checkedAt: new Date().toISOString(),
    items,
  };
}
