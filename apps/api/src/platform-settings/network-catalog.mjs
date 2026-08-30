/**
 * Build B16 network catalog cards from domain registry + maintenance + watcher heartbeats.
 */
import { listAssetNetworkRegistry, NetworkId } from "@cryptogate/domain";
import { listNetworkMaintenanceRows } from "./network-maintenance-store.mjs";
import { isMaintenanceEffective } from "./network-maintenance-rules.mjs";
import { listWatcherHeartbeats } from "../ops/watcher-health-store.mjs";
import { computeOrderabilityLamp } from "./network-lamp.mjs";

const NETWORK_TITLE = {
  [NetworkId.Ethereum]: "Ethereum",
  [NetworkId.Tron]: "TRON",
  [NetworkId.TronNile]: "TRON Nile",
  [NetworkId.BnbSmartChain]: "BNB Smart Chain",
  [NetworkId.Polygon]: "Polygon",
  [NetworkId.ArbitrumOne]: "Arbitrum One",
  [NetworkId.Solana]: "Solana",
  [NetworkId.Ton]: "TON",
  [NetworkId.Base]: "Base",
  [NetworkId.Bitcoin]: "Bitcoin",
};

/**
 * Prefer USDT as the primary display pair, else first enabled, else first row.
 * @param {import("@cryptogate/domain").AssetNetworkConfig[]} rows
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

/**
 * @returns {Promise<{
 *   chainEnv: string,
 *   checkedAt: string,
 *   items: object[],
 * }>}
 */
export async function buildNetworkCatalog() {
  const registry = listAssetNetworkRegistry();
  const byNet = new Map();
  for (const row of registry) {
    const list = byNet.get(row.network) ?? [];
    list.push(row);
    byNet.set(row.network, list);
  }

  let maintenanceRows = [];
  let heartbeats = [];
  try {
    maintenanceRows = await listNetworkMaintenanceRows();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/network_maintenance|does not exist/i.test(message)) throw err;
  }
  try {
    heartbeats = await listWatcherHeartbeats();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/watcher_heartbeats|does not exist/i.test(message)) throw err;
  }

  const maintByNet = new Map(maintenanceRows.map((m) => [m.network, m]));
  const hbByNet = new Map(heartbeats.map((h) => [h.network, h]));

  const items = [];
  for (const [network, rows] of byNet) {
    const enabledPairs = rows.filter((r) => r.enabled);
    const primary = pickPrimary(rows);
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
      confirmations: primary?.requiredConfirmations ?? null,
      minAmount: primary?.minAmount ?? null,
      contractAddress: primary?.contractAddress ?? null,
      pairs: rows.map((r) => {
        const pairLamp = computeOrderabilityLamp({
          enabled: r.enabled,
          maintenanceActive: underMaintenance,
          ingestStatus: ingest.ingestStatus,
        });
        return {
          asset: r.asset,
          enabled: r.enabled,
          contractAddress: r.contractAddress,
          decimals: r.decimals,
          minAmount: r.minAmount,
          requiredConfirmations: r.requiredConfirmations,
          displayNetwork: r.displayNetwork,
          lamp: pairLamp,
        };
      }),
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
    chainEnv: process.env.CRYPTOGATE_CHAIN_ENV?.trim() || "mainnet",
    checkedAt: new Date().toISOString(),
    items,
  };
}
