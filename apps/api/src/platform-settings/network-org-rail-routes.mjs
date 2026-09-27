/**
 * Platform-owned per-merchant / per-site rail settings routes.
 * GET/PUT /v1/platform/orgs/{orgId}/networks/{network}/rail-settings
 * GET/PUT /v1/platform/sites/{siteId}/networks/{network}/rail-settings
 */
import { getAssetNetworkConfig, listAssetNetworkRegistry } from "@paymentgate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import {
  canManagePlatform,
  canReadPlatformOrgPolicy,
} from "../orgs/role-policy.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { findBillingMerchantOrg } from "../orgs/org-ancestry.mjs";
import { isKnownNetworkId } from "./network-maintenance-rules.mjs";
import { validatePutScopedRailSettingsBody } from "./network-rail-settings-rules.mjs";
import {
  getPlatformMerchantNetworkRailSettings,
  getPlatformMerchantPairRailSettings,
  getPlatformSiteNetworkRailSettings,
  getPlatformSitePairRailSettings,
  listPlatformMerchantPairRailSettings,
  listPlatformSitePairRailSettings,
  upsertPlatformMerchantNetworkRailSettings,
  upsertPlatformMerchantPairRailSettings,
  upsertPlatformSiteNetworkRailSettings,
  upsertPlatformSitePairRailSettings,
} from "./network-rail-settings-store.mjs";
import {
  resolveEffectiveAssetNetworkConfig,
  resolveMerchantParentFloors,
  resolveSiteParentFloors,
} from "./network-rail-resolve.mjs";

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {"read" | "write"} mode
 */
async function requirePlatformRailAccess(req, res, mode) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;
  if (mode === "write") {
    if (!canManagePlatform(caller)) {
      sendError(
        res,
        403,
        "forbidden",
        "Only platform Owner or Administrator may change org/site rail settings",
      );
      return null;
    }
  } else if (!canReadPlatformOrgPolicy(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read org/site rail settings");
    return null;
  }
  return caller;
}

/**
 * @param {string} orgIdRaw
 * @param {"merchant" | "merchant_site"} expectedType
 */
async function loadScopedOrg(orgIdRaw, expectedType) {
  const id = typeof orgIdRaw === "string" ? orgIdRaw.trim() : "";
  if (!id) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: expectedType === "merchant" ? "orgId is required" : "siteId is required",
    };
  }
  const org = await findOrgById(id);
  if (!org) {
    return { ok: false, status: 404, code: "not_found", message: "Org not found" };
  }
  if (org.type !== expectedType) {
    return {
      ok: false,
      status: 422,
      code: "invalid_org_type",
      message:
        expectedType === "merchant"
          ? "orgId must be a merchant account"
          : "siteId must be a merchant_site account",
    };
  }
  return { ok: true, org };
}

/**
 * @param {string} network
 */
function enabledPairsForNetwork(network) {
  return listAssetNetworkRegistry().filter(
    (r) => r.network === network && r.enabled,
  );
}

/**
 * Build GET payload for a scoped overlay.
 * @param {{
 *   scope: "merchant" | "site",
 *   scopeId: string,
 *   network: string,
 *   parentConfirmations: number,
 *   overrideConfirmations: number | null,
 *   pairOverrides: Map<string, string | null>,
 *   parentMinForAsset: (asset: string) => Promise<string>,
 *   merchantOrgId?: string | null,
 *   siteId?: string | null,
 * }} args
 */
async function buildScopedRailResponse(args) {
  const pairs = [];
  for (const row of enabledPairsForNetwork(args.network)) {
    const parentMin = await args.parentMinForAsset(row.asset);
    const overrideMin = args.pairOverrides.has(row.asset)
      ? args.pairOverrides.get(row.asset)
      : null;
    const effective = await resolveEffectiveAssetNetworkConfig(
      row.asset,
      args.network,
      {
        orgId: args.merchantOrgId ?? (args.scope === "merchant" ? args.scopeId : null),
        siteId: args.siteId ?? (args.scope === "site" ? args.scopeId : null),
      },
    );
    pairs.push({
      asset: row.asset,
      parentFloorMinAmount: parentMin,
      overrideMinAmount: overrideMin ?? null,
      effectiveMinAmount: effective?.minAmount ?? parentMin,
      registryMinAmount: row.minAmount,
    });
  }

  const primary = pairs.find((p) => p.asset === "USDT") ?? pairs[0] ?? null;
  const effectiveConfirms =
    args.overrideConfirmations != null &&
    args.overrideConfirmations >= args.parentConfirmations
      ? args.overrideConfirmations
      : args.parentConfirmations;

  return {
    network: args.network,
    ...(args.scope === "merchant"
      ? { orgId: args.scopeId }
      : { siteId: args.scopeId, merchantOrgId: args.merchantOrgId ?? null }),
    parentFloorConfirmations: args.parentConfirmations,
    overrideConfirmations: args.overrideConfirmations,
    effectiveConfirmations: effectiveConfirms,
    pairs,
    primaryAsset: primary?.asset ?? null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * GET /v1/platform/orgs/{orgId}/networks/{network}/rail-settings
 */
export async function handleGetPlatformOrgNetworkRailSettings(
  req,
  res,
  orgIdRaw,
  networkRaw,
) {
  const caller = await requirePlatformRailAccess(req, res, "read");
  if (!caller) return;

  const scoped = await loadScopedOrg(orgIdRaw, "merchant");
  if (!scoped.ok) {
    sendError(res, scoped.status, scoped.code, scoped.message);
    return;
  }
  const network = typeof networkRaw === "string" ? networkRaw.trim() : "";
  if (!isKnownNetworkId(network)) {
    sendError(res, 404, "not_found", "Unknown network id");
    return;
  }

  try {
    const floors = await resolveMerchantParentFloors(network);
    let netOverride = null;
    /** @type {Map<string, string | null>} */
    const pairOverrides = new Map();
    try {
      netOverride = await getPlatformMerchantNetworkRailSettings(
        scoped.org.id,
        network,
      );
      const pairs = await listPlatformMerchantPairRailSettings(scoped.org.id);
      for (const p of pairs) {
        if (p.network === network) pairOverrides.set(p.asset, p.minAmount);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        !/platform_merchant_network_rail_settings|platform_merchant_pair_rail_settings|does not exist/i.test(
          message,
        )
      ) {
        throw err;
      }
    }

    const payload = await buildScopedRailResponse({
      scope: "merchant",
      scopeId: scoped.org.id,
      network,
      parentConfirmations: floors.parentConfirmations,
      overrideConfirmations: netOverride?.requiredConfirmations ?? null,
      pairOverrides,
      parentMinForAsset: floors.parentMinAmountForAsset,
      merchantOrgId: scoped.org.id,
    });
    sendJson(res, 200, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[platform-org-rail-get]", message);
    sendError(res, 500, "internal_error", "Failed to load org rail settings");
  }
}

/**
 * PUT /v1/platform/orgs/{orgId}/networks/{network}/rail-settings
 */
export async function handlePutPlatformOrgNetworkRailSettings(
  req,
  res,
  orgIdRaw,
  networkRaw,
) {
  const caller = await requirePlatformRailAccess(req, res, "write");
  if (!caller) return;

  const scoped = await loadScopedOrg(orgIdRaw, "merchant");
  if (!scoped.ok) {
    sendError(res, scoped.status, scoped.code, scoped.message);
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

  try {
    const floors = await resolveMerchantParentFloors(network);
    /** @type {Map<string, string>} */
    const parentMinCache = new Map();
    if (typeof body?.asset === "string" && body.asset.trim()) {
      const a = body.asset.trim().toUpperCase();
      parentMinCache.set(a, await floors.parentMinAmountForAsset(a));
    }

    const validated = validatePutScopedRailSettingsBody(body, network, {
      parentConfirmations: floors.parentConfirmations,
      parentMinAmountForAsset: (a) =>
        parentMinCache.get(a) ??
        getAssetNetworkConfig(a, network)?.minAmount ??
        "0",
    });
    if (!validated.ok) {
      sendError(res, validated.status, validated.code, validated.message);
      return;
    }

    if (validated.asset && validated.minAmount != null) {
      const parentMin = await floors.parentMinAmountForAsset(validated.asset);
      const { compareAmount } = await import("./network-rail-settings-rules.mjs");
      if (compareAmount(validated.minAmount, parentMin) < 0) {
        sendError(
          res,
          422,
          "min_amount_below_parent",
          `minAmount must be at least the parent floor for ${validated.asset} (${parentMin})`,
        );
        return;
      }
    }

    let netRow = await getPlatformMerchantNetworkRailSettings(
      scoped.org.id,
      network,
    );
    if (validated.requiredConfirmations !== undefined) {
      netRow = await upsertPlatformMerchantNetworkRailSettings({
        orgId: scoped.org.id,
        network,
        requiredConfirmations: validated.requiredConfirmations,
        updatedByUserId: caller.userId,
      });
    }

    let pairRow = null;
    if (validated.minAmount !== undefined && validated.asset) {
      pairRow = await upsertPlatformMerchantPairRailSettings({
        orgId: scoped.org.id,
        network,
        asset: validated.asset,
        minAmount: validated.minAmount,
        updatedByUserId: caller.userId,
      });
    } else if (validated.asset) {
      pairRow = await getPlatformMerchantPairRailSettings(
        scoped.org.id,
        network,
        validated.asset,
      );
    }

    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId: scoped.org.id,
      action: AUDIT_ACTIONS.platformOrgRailSettingsPut,
      metadata: {
        network,
        asset: validated.asset ?? null,
        requiredConfirmations: netRow?.requiredConfirmations ?? null,
        minAmount: pairRow?.minAmount ?? null,
        scope: "merchant",
      },
    });
    emitDashboardLive({
      type: "network.rail",
      slices: ["networks"],
      broadcast: true,
    });

    const pairOverrides = new Map();
    const allPairs = await listPlatformMerchantPairRailSettings(scoped.org.id);
    for (const p of allPairs) {
      if (p.network === network) pairOverrides.set(p.asset, p.minAmount);
    }
    if (pairRow) pairOverrides.set(pairRow.asset, pairRow.minAmount);

    const payload = await buildScopedRailResponse({
      scope: "merchant",
      scopeId: scoped.org.id,
      network,
      parentConfirmations: floors.parentConfirmations,
      overrideConfirmations: netRow?.requiredConfirmations ?? null,
      pairOverrides,
      parentMinForAsset: floors.parentMinAmountForAsset,
      merchantOrgId: scoped.org.id,
    });
    sendJson(res, 200, {
      ...payload,
      updatedAt: pairRow?.updatedAt ?? netRow?.updatedAt ?? payload.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      /platform_merchant_network_rail_settings|platform_merchant_pair_rail_settings|does not exist/i.test(
        message,
      )
    ) {
      sendError(
        res,
        503,
        "unavailable",
        "org rail settings table missing — run migrations",
      );
      return;
    }
    console.error("[platform-org-rail-put]", message);
    sendError(res, 500, "internal_error", "Failed to update org rail settings");
  }
}

/**
 * GET /v1/platform/sites/{siteId}/networks/{network}/rail-settings
 */
export async function handleGetPlatformSiteNetworkRailSettings(
  req,
  res,
  siteIdRaw,
  networkRaw,
) {
  const caller = await requirePlatformRailAccess(req, res, "read");
  if (!caller) return;

  const scoped = await loadScopedOrg(siteIdRaw, "merchant_site");
  if (!scoped.ok) {
    sendError(res, scoped.status, scoped.code, scoped.message);
    return;
  }
  const network = typeof networkRaw === "string" ? networkRaw.trim() : "";
  if (!isKnownNetworkId(network)) {
    sendError(res, 404, "not_found", "Unknown network id");
    return;
  }

  try {
    const billing = await findBillingMerchantOrg(scoped.org);
    const merchantOrgId = billing?.id ?? null;
    const floors = await resolveSiteParentFloors(network, merchantOrgId);
    let netOverride = null;
    /** @type {Map<string, string | null>} */
    const pairOverrides = new Map();
    try {
      netOverride = await getPlatformSiteNetworkRailSettings(
        scoped.org.id,
        network,
      );
      const pairs = await listPlatformSitePairRailSettings(scoped.org.id);
      for (const p of pairs) {
        if (p.network === network) pairOverrides.set(p.asset, p.minAmount);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        !/platform_site_network_rail_settings|platform_site_pair_rail_settings|does not exist/i.test(
          message,
        )
      ) {
        throw err;
      }
    }

    const payload = await buildScopedRailResponse({
      scope: "site",
      scopeId: scoped.org.id,
      network,
      parentConfirmations: floors.parentConfirmations,
      overrideConfirmations: netOverride?.requiredConfirmations ?? null,
      pairOverrides,
      parentMinForAsset: floors.parentMinAmountForAsset,
      merchantOrgId,
      siteId: scoped.org.id,
    });
    sendJson(res, 200, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[platform-site-rail-get]", message);
    sendError(res, 500, "internal_error", "Failed to load site rail settings");
  }
}

/**
 * PUT /v1/platform/sites/{siteId}/networks/{network}/rail-settings
 */
export async function handlePutPlatformSiteNetworkRailSettings(
  req,
  res,
  siteIdRaw,
  networkRaw,
) {
  const caller = await requirePlatformRailAccess(req, res, "write");
  if (!caller) return;

  const scoped = await loadScopedOrg(siteIdRaw, "merchant_site");
  if (!scoped.ok) {
    sendError(res, scoped.status, scoped.code, scoped.message);
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

  try {
    const billing = await findBillingMerchantOrg(scoped.org);
    const merchantOrgId = billing?.id ?? null;
    const floors = await resolveSiteParentFloors(network, merchantOrgId);
    /** @type {Map<string, string>} */
    const parentMinCache = new Map();

    // Warm parent mins for any asset in body
    if (typeof body?.asset === "string" && body.asset.trim()) {
      const a = body.asset.trim().toUpperCase();
      parentMinCache.set(a, await floors.parentMinAmountForAsset(a));
    }

    const validated = validatePutScopedRailSettingsBody(body, network, {
      parentConfirmations: floors.parentConfirmations,
      parentMinAmountForAsset: (a) =>
        parentMinCache.get(a) ??
        getAssetNetworkConfig(a, network)?.minAmount ??
        "0",
    });
    if (!validated.ok) {
      sendError(res, validated.status, validated.code, validated.message);
      return;
    }

    if (validated.asset && validated.minAmount != null) {
      const parentMin = await floors.parentMinAmountForAsset(validated.asset);
      const { compareAmount } = await import("./network-rail-settings-rules.mjs");
      if (compareAmount(validated.minAmount, parentMin) < 0) {
        sendError(
          res,
          422,
          "min_amount_below_parent",
          `minAmount must be at least the parent floor for ${validated.asset} (${parentMin})`,
        );
        return;
      }
    }

    let netRow = await getPlatformSiteNetworkRailSettings(scoped.org.id, network);
    if (validated.requiredConfirmations !== undefined) {
      netRow = await upsertPlatformSiteNetworkRailSettings({
        siteId: scoped.org.id,
        network,
        requiredConfirmations: validated.requiredConfirmations,
        updatedByUserId: caller.userId,
      });
    }

    let pairRow = null;
    if (validated.minAmount !== undefined && validated.asset) {
      pairRow = await upsertPlatformSitePairRailSettings({
        siteId: scoped.org.id,
        network,
        asset: validated.asset,
        minAmount: validated.minAmount,
        updatedByUserId: caller.userId,
      });
    } else if (validated.asset) {
      pairRow = await getPlatformSitePairRailSettings(
        scoped.org.id,
        network,
        validated.asset,
      );
    }

    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId: scoped.org.id,
      action: AUDIT_ACTIONS.platformSiteRailSettingsPut,
      metadata: {
        network,
        asset: validated.asset ?? null,
        requiredConfirmations: netRow?.requiredConfirmations ?? null,
        minAmount: pairRow?.minAmount ?? null,
        scope: "site",
        merchantOrgId,
      },
    });
    emitDashboardLive({
      type: "network.rail",
      slices: ["networks"],
      broadcast: true,
    });

    const pairOverrides = new Map();
    const allPairs = await listPlatformSitePairRailSettings(scoped.org.id);
    for (const p of allPairs) {
      if (p.network === network) pairOverrides.set(p.asset, p.minAmount);
    }
    if (pairRow) pairOverrides.set(pairRow.asset, pairRow.minAmount);

    const payload = await buildScopedRailResponse({
      scope: "site",
      scopeId: scoped.org.id,
      network,
      parentConfirmations: floors.parentConfirmations,
      overrideConfirmations: netRow?.requiredConfirmations ?? null,
      pairOverrides,
      parentMinForAsset: floors.parentMinAmountForAsset,
      merchantOrgId,
      siteId: scoped.org.id,
    });
    sendJson(res, 200, {
      ...payload,
      updatedAt: pairRow?.updatedAt ?? netRow?.updatedAt ?? payload.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      /platform_site_network_rail_settings|platform_site_pair_rail_settings|does not exist/i.test(
        message,
      )
    ) {
      sendError(
        res,
        503,
        "unavailable",
        "site rail settings table missing — run migrations",
      );
      return;
    }
    console.error("[platform-site-rail-put]", message);
    sendError(res, 500, "internal_error", "Failed to update site rail settings");
  }
}
