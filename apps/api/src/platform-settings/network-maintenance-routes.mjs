import { readJsonBody, sendError, sendJson, sendJsonCached } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import {
  canManagePlatform,
  canReadPlatformOrgPolicy,
} from "../orgs/role-policy.mjs";
import { buildNetworkCatalog, invalidateNetworkCatalogCache } from "./network-catalog.mjs";
import {
  isKnownNetworkId,
  validatePutNetworkMaintenanceBody,
} from "./network-maintenance-rules.mjs";
import {
  listActiveNetworkMaintenance,
  upsertNetworkMaintenance,
} from "./network-maintenance-store.mjs";
import {
  registryNetworkFloors,
  validatePutMerchantRailSettingsBody,
  validatePutPlatformRailSettingsBody,
} from "./network-rail-settings-rules.mjs";
import {
  listMerchantNetworkRailSettings,
  upsertMerchantNetworkRailSettings,
  upsertPlatformNetworkRailSettings,
  upsertPlatformPairRailSettings,
  getPlatformNetworkRailSettings,
  getPlatformPairRailSettings,
} from "./network-rail-settings-store.mjs";
import {
  resolvePlatformFloorConfirmations,
} from "./network-rail-resolve.mjs";

/**
 * GET /v1/platform/networks/catalog — B16 cards (registry + maintenance + ingest).
 */
export async function handleGetNetworkCatalog(req, res) {
  try {
    const caller = await requireCaller(req, res);
    if (!caller) return;
    if (!canReadPlatformOrgPolicy(caller)) {
      sendError(res, 403, "forbidden", "Not allowed to read network catalog");
      return;
    }
    const catalog = await buildNetworkCatalog();
    sendJson(res, 200, catalog);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[network-catalog]", message);
    sendError(res, 500, "internal_error", "Failed to load network catalog");
  }
}

/**
 * PUT /v1/platform/networks/{network}/maintenance — platform O/A.
 */
export async function handlePutNetworkMaintenance(req, res, networkRaw) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canManagePlatform(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only platform Owner or Administrator may change network maintenance",
    );
    return;
  }

  const network = typeof networkRaw === "string" ? networkRaw.trim() : "";
  if (!isKnownNetworkId(network)) {
    sendError(res, 404, "not_found", "Unknown network id");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validatePutNetworkMaintenanceBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  try {
    const row = await upsertNetworkMaintenance({
      network,
      active: validated.active,
      message: validated.message,
      endsAt: validated.endsAt,
      updatedByUserId: caller.userId,
    });
    invalidateNetworkCatalogCache();
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId: null,
      action: AUDIT_ACTIONS.networkMaintenancePut,
      metadata: {
        network,
        active: validated.active,
        endsAt: validated.endsAt,
      },
    });
    emitDashboardLive({
      type: "network.maintenance",
      slices: ["networks"],
      broadcast: true,
    });
    sendJson(res, 200, {
      network: row.network,
      active: row.active,
      message: row.message,
      startedAt: row.startedAt,
      endsAt: row.endsAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/network_maintenance|does not exist/i.test(message)) {
      sendError(
        res,
        503,
        "unavailable",
        "network_maintenance table missing — run migrations",
      );
      return;
    }
    console.error("[network-maintenance]", message);
    sendError(res, 500, "internal_error", "Failed to update network maintenance");
  }
}

/**
 * GET /v1/networks/status — any authenticated session.
 * Compact orderability lamps (Open / Paused / Down / Off) for merchant + agent UIs.
 */
export async function handleGetNetworksStatus(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  try {
    const catalog = await buildNetworkCatalog();
    sendJsonCached(res, 200, {
      chainEnv: catalog.chainEnv,
      checkedAt: catalog.checkedAt,
      items: catalog.items.map((card) => ({
        network: card.network,
        title: card.title,
        lamp: card.lamp,
        maintenance: {
          active: card.maintenance.active,
          message: card.maintenance.message,
        },
        ingestStatus: card.ingest.ingestStatus,
        pairs: card.pairs.map((p) => ({
          asset: p.asset,
          enabled: p.enabled,
          lamp: p.lamp,
          displayNetwork: p.displayNetwork,
        })),
      })),
    }, { maxAgeSec: 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[networks-status]", message);
    sendError(res, 500, "internal_error", "Failed to load network status");
  }
}

/**
 * GET /v1/network-maintenance — any authenticated session (merchant banners).
 */
export async function handleListActiveNetworkMaintenance(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  try {
    const items = await listActiveNetworkMaintenance();
    sendJson(res, 200, {
      items: items.map((row) => ({
        network: row.network,
        message: row.message,
        startedAt: row.startedAt,
        endsAt: row.endsAt,
      })),
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/network_maintenance|does not exist/i.test(message)) {
      sendJson(res, 200, {
        items: [],
        checkedAt: new Date().toISOString(),
        note: "network_maintenance table missing — run migrations",
      });
      return;
    }
    sendError(res, 500, "internal_error", "Failed to load network maintenance");
  }
}

/**
 * PUT /v1/platform/networks/{network}/rail-settings — platform O/A.
 * Body: { requiredConfirmations?: number|null, asset?: string, minAmount?: string|null }
 * Confirmations are network-scoped; minAmount requires asset (pair-scoped).
 * null clears that field back to registry. Applies to new orders only.
 */
export async function handlePutPlatformNetworkRailSettings(req, res, networkRaw) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canManagePlatform(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only platform Owner or Administrator may change rail settings",
    );
    return;
  }

  const network = typeof networkRaw === "string" ? networkRaw.trim() : "";
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validatePutPlatformRailSettingsBody(body, network);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  try {
    let netRow = await getPlatformNetworkRailSettings(network);
    if (validated.requiredConfirmations !== undefined) {
      netRow = await upsertPlatformNetworkRailSettings({
        network,
        requiredConfirmations: validated.requiredConfirmations,
        updatedByUserId: caller.userId,
      });
    }

    let pairRow = null;
    if (validated.minAmount !== undefined && validated.asset) {
      pairRow = await upsertPlatformPairRailSettings({
        network,
        asset: validated.asset,
        minAmount: validated.minAmount,
        updatedByUserId: caller.userId,
      });
    } else if (validated.asset) {
      pairRow = await getPlatformPairRailSettings(network, validated.asset);
    }

    invalidateNetworkCatalogCache();
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId: null,
      action: AUDIT_ACTIONS.networkRailSettingsPut,
      metadata: {
        network,
        asset: validated.asset ?? null,
        requiredConfirmations: netRow?.requiredConfirmations ?? null,
        minAmount: pairRow?.minAmount ?? null,
      },
    });
    emitDashboardLive({
      type: "network.rail",
      slices: ["networks"],
      broadcast: true,
    });

    const floors = registryNetworkFloors(network);
    const { getAssetNetworkConfig } = await import("@paymentgate/domain");
    const pairBase =
      validated.asset != null
        ? getAssetNetworkConfig(validated.asset, network)
        : null;
    const effectiveConfirms =
      netRow?.requiredConfirmations ?? floors.requiredConfirmations;
    const effectiveMin =
      pairRow?.minAmount ??
      pairBase?.minAmount ??
      floors.minAmount;

    sendJson(res, 200, {
      network,
      asset: validated.asset ?? floors.primaryAsset,
      requiredConfirmations: effectiveConfirms,
      minAmount: effectiveMin,
      registryConfirmations: floors.requiredConfirmations,
      registryMinAmount: pairBase?.minAmount ?? floors.minAmount,
      railOverride: {
        requiredConfirmations: netRow?.requiredConfirmations ?? null,
        minAmount: pairRow?.minAmount ?? null,
      },
      updatedAt: pairRow?.updatedAt ?? netRow?.updatedAt ?? new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      /platform_network_rail_settings|platform_pair_rail_settings|does not exist/i.test(
        message,
      )
    ) {
      sendError(
        res,
        503,
        "unavailable",
        "rail settings table missing — run migrations",
      );
      return;
    }
    console.error("[network-rail-settings]", message);
    sendError(res, 500, "internal_error", "Failed to update rail settings");
  }
}

function merchantOrgRailScope(caller, orgIdRaw) {
  const orgId = typeof orgIdRaw === "string" ? orgIdRaw.trim() : "";
  if (!orgId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "orgId is required",
    };
  }
  if (caller.platformOperator) return { ok: true, orgId };
  const membership = caller.memberships.find((m) => m.orgId === orgId);
  if (
    !membership ||
    !["merchant", "merchant_site"].includes(membership.orgType)
  ) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Not allowed for this org",
    };
  }
  return { ok: true, orgId, role: membership.role };
}

/**
 * GET /v1/orgs/{orgId}/network-rails — effective confirms per network for merchant UI.
 */
export async function handleGetMerchantNetworkRails(req, res, orgIdRaw) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const scope = merchantOrgRailScope(caller, orgIdRaw);
  if (!scope.ok) {
    sendError(res, scope.status, scope.code, scope.message);
    return;
  }
  const orgId = scope.orgId;

  try {
    const catalog = await buildNetworkCatalog();
    let merchantRows = [];
    try {
      merchantRows = await listMerchantNetworkRailSettings(orgId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/merchant_network_rail_settings|does not exist/i.test(message)) throw err;
    }
    const merchantByNet = new Map(
      merchantRows.map((r) => [r.network, r.requiredConfirmations]),
    );

    sendJson(res, 200, {
      orgId,
      checkedAt: catalog.checkedAt,
      items: catalog.items.map((card) => {
        const platformFloor = card.confirmations ?? 1;
        const merchantOverride = merchantByNet.get(card.network) ?? null;
        const effective =
          merchantOverride != null && merchantOverride >= platformFloor
            ? merchantOverride
            : platformFloor;
        return {
          network: card.network,
          title: card.title,
          lamp: card.lamp,
          primaryAsset: card.primaryAsset,
          minAmount: card.minAmount,
          platformFloorConfirmations: platformFloor,
          merchantConfirmations: merchantOverride,
          effectiveConfirmations: effective,
          pairs: card.pairs
            .filter((p) => p.enabled)
            .map((p) => ({
              asset: p.asset,
              displayNetwork: p.displayNetwork,
              lamp: p.lamp,
              minAmount: p.minAmount,
              platformConfirmations: p.requiredConfirmations,
              effectiveConfirmations:
                merchantOverride != null &&
                merchantOverride >= p.requiredConfirmations
                  ? merchantOverride
                  : p.requiredConfirmations,
            })),
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[merchant-network-rails]", message);
    sendError(res, 500, "internal_error", "Failed to load network rails");
  }
}

/**
 * PUT /v1/orgs/{orgId}/networks/{network}/rail-settings
 * Merchant may only raise confirmations above the platform floor (new orders only).
 */
export async function handlePutMerchantNetworkRailSettings(
  req,
  res,
  orgIdRaw,
  networkRaw,
) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const scope = merchantOrgRailScope(caller, orgIdRaw);
  if (!scope.ok) {
    sendError(res, scope.status, scope.code, scope.message);
    return;
  }
  const orgId = scope.orgId;
  const canWrite =
    caller.platformOperator ||
    scope.role === "owner" ||
    scope.role === "administrator";
  if (!canWrite) {
    sendError(res, 403, "forbidden", "Owner/Admin required");
    return;
  }

  const network = typeof networkRaw === "string" ? networkRaw.trim() : "";
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  let platformFloor;
  try {
    platformFloor = await resolvePlatformFloorConfirmations(network);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 500, "internal_error", message);
    return;
  }
  if (platformFloor == null) {
    sendError(res, 422, "network_disabled", "No enabled pairs on this network");
    return;
  }

  const validated = validatePutMerchantRailSettingsBody(
    body,
    network,
    platformFloor,
  );
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  try {
    const row = await upsertMerchantNetworkRailSettings({
      orgId,
      network,
      requiredConfirmations: validated.requiredConfirmations,
      updatedByUserId: caller.userId,
    });
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId,
      action: AUDIT_ACTIONS.merchantNetworkRailSettingsPut,
      metadata: {
        network,
        requiredConfirmations: row.requiredConfirmations,
        platformFloor,
      },
    });
    sendJson(res, 200, {
      orgId,
      network,
      platformFloorConfirmations: platformFloor,
      merchantConfirmations: row.requiredConfirmations,
      effectiveConfirmations: row.requiredConfirmations ?? platformFloor,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/merchant_network_rail_settings|does not exist/i.test(message)) {
      sendError(
        res,
        503,
        "unavailable",
        "merchant_network_rail_settings table missing — run migrations",
      );
      return;
    }
    console.error("[merchant-network-rail]", message);
    sendError(res, 500, "internal_error", "Failed to update merchant rail settings");
  }
}
