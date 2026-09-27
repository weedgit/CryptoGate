import { getAssetNetworkConfig, listAssetNetworkRegistry } from "@paymentgate/domain";
import { isKnownNetworkId } from "./network-maintenance-rules.mjs";

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/**
 * Registry floor for a network: max requiredConfirmations among enabled pairs + primary asset.
 * @param {string} network
 */
export function registryNetworkFloors(network) {
  const rows = listAssetNetworkRegistry().filter(
    (r) => r.network === network && r.enabled,
  );
  if (rows.length === 0) {
    return { requiredConfirmations: null, minAmount: null, primaryAsset: null };
  }
  const primary = rows.find((r) => r.asset === "USDT") ?? rows[0];
  let confirms = 0;
  for (const row of rows) {
    if (row.requiredConfirmations > confirms) confirms = row.requiredConfirmations;
  }
  return {
    requiredConfirmations: confirms,
    minAmount: primary.minAmount,
    primaryAsset: primary.asset,
  };
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a < b
 */
export function compareAmount(a, b) {
  const [ai, af = ""] = String(a).split(".");
  const [bi, bf = ""] = String(b).split(".");
  const pad = Math.max(af.length, bf.length);
  const aMinor = BigInt(ai + af.padEnd(pad, "0"));
  const bMinor = BigInt(bi + bf.padEnd(pad, "0"));
  if (aMinor === bMinor) return 0;
  return aMinor < bMinor ? -1 : 1;
}

/**
 * @param {unknown} body
 * @param {string} network
 */
export function validatePutPlatformRailSettingsBody(body, network) {
  if (!isKnownNetworkId(network)) {
    return { ok: false, status: 404, code: "not_found", message: "Unknown network id" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  const floors = registryNetworkFloors(network);
  if (floors.requiredConfirmations == null) {
    return {
      ok: false,
      status: 422,
      code: "network_disabled",
      message: "No enabled pairs on this network",
    };
  }

  /** @type {number | null | undefined} */
  let requiredConfirmations = undefined;
  if ("requiredConfirmations" in body) {
    if (body.requiredConfirmations === null) {
      requiredConfirmations = null;
    } else if (
      typeof body.requiredConfirmations !== "number" ||
      !Number.isInteger(body.requiredConfirmations) ||
      body.requiredConfirmations < 1 ||
      body.requiredConfirmations > 256
    ) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "requiredConfirmations must be an integer 1–256, or null to reset",
      };
    } else {
      requiredConfirmations = body.requiredConfirmations;
    }
  }

  /** @type {string | null | undefined} */
  let minAmount = undefined;
  /** @type {string | undefined} */
  let asset = undefined;

  if ("minAmount" in body) {
    if (typeof body.asset !== "string" || !body.asset.trim()) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "asset is required when setting minAmount",
      };
    }
    asset = body.asset.trim().toUpperCase();
    const pair = getAssetNetworkConfig(asset, network);
    if (!pair || !pair.enabled) {
      return {
        ok: false,
        status: 422,
        code: "asset_network_disabled",
        message: `${asset} is not enabled on ${network}`,
      };
    }

    if (body.minAmount === null) {
      minAmount = null;
    } else if (typeof body.minAmount !== "string" || !AMOUNT_RE.test(body.minAmount.trim())) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "minAmount must be a non-negative decimal string, or null to reset",
      };
    } else {
      const trimmed = body.minAmount.trim();
      if (compareAmount(trimmed, pair.minAmount) < 0) {
        return {
          ok: false,
          status: 422,
          code: "min_amount_below_registry",
          message: `minAmount must be at least the registry floor for ${asset} (${pair.minAmount})`,
        };
      }
      minAmount = trimmed;
    }
  } else if ("asset" in body && body.asset != null) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "asset is only used with minAmount",
    };
  }

  if (requiredConfirmations === undefined && minAmount === undefined) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Provide requiredConfirmations and/or minAmount (+ asset)",
    };
  }

  return { ok: true, requiredConfirmations, minAmount, asset, floors };
}

/**
 * @param {unknown} body
 * @param {string} network
 * @param {number} platformFloor
 */
export function validatePutMerchantRailSettingsBody(body, network, platformFloor) {
  if (!isKnownNetworkId(network)) {
    return { ok: false, status: 404, code: "not_found", message: "Unknown network id" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  if (!("requiredConfirmations" in body)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "requiredConfirmations is required (integer or null to reset)",
    };
  }

  if (body.requiredConfirmations === null) {
    return { ok: true, requiredConfirmations: null };
  }

  if (
    typeof body.requiredConfirmations !== "number" ||
    !Number.isInteger(body.requiredConfirmations) ||
    body.requiredConfirmations < 1 ||
    body.requiredConfirmations > 256
  ) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "requiredConfirmations must be an integer 1–256, or null to reset",
    };
  }

  if (body.requiredConfirmations < platformFloor) {
    return {
      ok: false,
      status: 422,
      code: "confirmations_below_platform",
      message: `Merchants may only raise confirmations (platform floor is ${platformFloor})`,
    };
  }

  return { ok: true, requiredConfirmations: body.requiredConfirmations };
}

/**
 * Raise-only merge: take next when set and ≥ current floor.
 * @param {number} floor
 * @param {number | null | undefined} next
 */
function raiseConfirmations(floor, next) {
  if (next == null) return floor;
  return next >= floor ? next : floor;
}

/**
 * Raise-only merge for decimal amount strings.
 * @param {string} floor
 * @param {string | null | undefined} next
 */
function raiseMinAmount(floor, next) {
  if (next == null) return floor;
  return compareAmount(next, floor) >= 0 ? next : floor;
}

/**
 * Effective policy for one asset+network.
 * Layers: registry → platform global → platform merchant → platform site → merchant self-serve.
 * Confirmations are network-scoped; minAmount is pair-scoped.
 * @param {string} asset
 * @param {string} network
 * @param {{
 *   platform?: { requiredConfirmations: number | null, minAmount?: string | null } | null,
 *   platformMerchant?: { requiredConfirmations: number | null, minAmount?: string | null } | null,
 *   platformSite?: { requiredConfirmations: number | null, minAmount?: string | null } | null,
 *   merchant?: { requiredConfirmations: number | null } | null,
 * }} overlays
 */
export function resolveRailPolicy(asset, network, overlays = {}) {
  const base = getAssetNetworkConfig(asset, network);
  if (!base) return null;

  const platform = overlays.platform ?? null;
  const platformMerchant = overlays.platformMerchant ?? null;
  const platformSite = overlays.platformSite ?? null;
  const merchant = overlays.merchant ?? null;

  let requiredConfirmations =
    platform?.requiredConfirmations != null
      ? platform.requiredConfirmations
      : base.requiredConfirmations;
  let minAmount =
    platform?.minAmount != null ? platform.minAmount : base.minAmount;

  const platformFloorConfirmations = requiredConfirmations;
  const platformFloorMinAmount = minAmount;

  requiredConfirmations = raiseConfirmations(
    requiredConfirmations,
    platformMerchant?.requiredConfirmations,
  );
  minAmount = raiseMinAmount(minAmount, platformMerchant?.minAmount);

  const merchantFloorConfirmations = requiredConfirmations;
  const merchantFloorMinAmount = minAmount;

  requiredConfirmations = raiseConfirmations(
    requiredConfirmations,
    platformSite?.requiredConfirmations,
  );
  minAmount = raiseMinAmount(minAmount, platformSite?.minAmount);

  requiredConfirmations = raiseConfirmations(
    requiredConfirmations,
    merchant?.requiredConfirmations,
  );

  return {
    ...base,
    requiredConfirmations,
    minAmount,
    platformFloorConfirmations,
    platformFloorMinAmount,
    merchantFloorConfirmations,
    merchantFloorMinAmount,
    registryConfirmations: base.requiredConfirmations,
    registryMinAmount: base.minAmount,
  };
}

/**
 * Validate platform-owned scoped rail PUT (merchant or site overlay).
 * Same body shape as global platform PUT; raise-only vs parent floor.
 * @param {unknown} body
 * @param {string} network
 * @param {{
 *   parentConfirmations: number,
 *   parentMinAmountForAsset?: (asset: string) => string,
 * }} floors
 */
export function validatePutScopedRailSettingsBody(body, network, floors) {
  if (!isKnownNetworkId(network)) {
    return { ok: false, status: 404, code: "not_found", message: "Unknown network id" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  /** @type {number | null | undefined} */
  let requiredConfirmations = undefined;
  if ("requiredConfirmations" in body) {
    if (body.requiredConfirmations === null) {
      requiredConfirmations = null;
    } else if (
      typeof body.requiredConfirmations !== "number" ||
      !Number.isInteger(body.requiredConfirmations) ||
      body.requiredConfirmations < 1 ||
      body.requiredConfirmations > 256
    ) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "requiredConfirmations must be an integer 1–256, or null to reset",
      };
    } else if (body.requiredConfirmations < floors.parentConfirmations) {
      return {
        ok: false,
        status: 422,
        code: "confirmations_below_parent",
        message: `Confirmations must be at least the parent floor (${floors.parentConfirmations})`,
      };
    } else {
      requiredConfirmations = body.requiredConfirmations;
    }
  }

  /** @type {string | null | undefined} */
  let minAmount = undefined;
  /** @type {string | undefined} */
  let asset = undefined;

  if ("minAmount" in body) {
    if (typeof body.asset !== "string" || !body.asset.trim()) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "asset is required when setting minAmount",
      };
    }
    asset = body.asset.trim().toUpperCase();
    const pair = getAssetNetworkConfig(asset, network);
    if (!pair || !pair.enabled) {
      return {
        ok: false,
        status: 422,
        code: "asset_network_disabled",
        message: `${asset} is not enabled on ${network}`,
      };
    }

    const parentMin =
      typeof floors.parentMinAmountForAsset === "function"
        ? floors.parentMinAmountForAsset(asset)
        : pair.minAmount;

    if (body.minAmount === null) {
      minAmount = null;
    } else if (typeof body.minAmount !== "string" || !AMOUNT_RE.test(body.minAmount.trim())) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "minAmount must be a non-negative decimal string, or null to reset",
      };
    } else {
      const trimmed = body.minAmount.trim();
      if (compareAmount(trimmed, parentMin) < 0) {
        return {
          ok: false,
          status: 422,
          code: "min_amount_below_parent",
          message: `minAmount must be at least the parent floor for ${asset} (${parentMin})`,
        };
      }
      minAmount = trimmed;
    }
  } else if ("asset" in body && body.asset != null) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "asset is only used with minAmount",
    };
  }

  if (requiredConfirmations === undefined && minAmount === undefined) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Provide requiredConfirmations and/or minAmount (+ asset)",
    };
  }

  return { ok: true, requiredConfirmations, minAmount, asset };
}
