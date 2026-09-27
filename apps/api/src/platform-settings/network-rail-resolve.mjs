/**
 * Resolve effective asset/network policy (registry + platform + org/site overlays).
 * Confirmations: network-scoped. Min amount: pair-scoped.
 * Precedence: Registry → Platform global → Platform→Merchant → Platform→Site → Merchant self-serve.
 */
import { getAssetNetworkConfig } from "@paymentgate/domain";
import { resolveRailPolicy } from "./network-rail-settings-rules.mjs";
import {
  getMerchantNetworkRailSettings,
  getPlatformMerchantNetworkRailSettings,
  getPlatformMerchantPairRailSettings,
  getPlatformNetworkRailSettings,
  getPlatformPairRailSettings,
  getPlatformSiteNetworkRailSettings,
  getPlatformSitePairRailSettings,
  listPlatformNetworkRailSettings,
  listPlatformPairRailSettings,
} from "./network-rail-settings-store.mjs";

function pairKey(network, asset) {
  return `${asset}:${network}`;
}

/**
 * Soft-fail when optional overlay tables are missing (pre-migration).
 * @param {unknown} err
 * @param {string} tableHint
 */
function isMissingTable(err, tableHint) {
  const message = err instanceof Error ? err.message : String(err);
  return new RegExp(`${tableHint}|does not exist`, "i").test(message);
}

/**
 * @param {string} asset
 * @param {string} network
 * @param {{ orgId?: string | null, siteId?: string | null }} [opts]
 *   orgId = billing merchant (platform merchant overlay + self-serve fallback).
 *   siteId = merchant_site org id (platform site overlay).
 *   When only orgId is set and the order org is a site, callers should pass siteId
 *   separately and orgId as the billing merchant.
 */
export async function resolveEffectiveAssetNetworkConfig(asset, network, opts = {}) {
  const base = getAssetNetworkConfig(asset, network);
  if (!base) return null;

  let platformNet = null;
  let platformPair = null;
  let platformMerchantNet = null;
  let platformMerchantPair = null;
  let platformSiteNet = null;
  let platformSitePair = null;
  let merchantSelfServe = null;

  try {
    platformNet = await getPlatformNetworkRailSettings(network);
  } catch (err) {
    if (!isMissingTable(err, "platform_network_rail_settings")) throw err;
  }
  try {
    platformPair = await getPlatformPairRailSettings(network, asset);
  } catch (err) {
    if (!isMissingTable(err, "platform_pair_rail_settings")) throw err;
  }

  if (opts.orgId) {
    try {
      platformMerchantNet = await getPlatformMerchantNetworkRailSettings(
        opts.orgId,
        network,
      );
    } catch (err) {
      if (!isMissingTable(err, "platform_merchant_network_rail_settings")) throw err;
    }
    try {
      platformMerchantPair = await getPlatformMerchantPairRailSettings(
        opts.orgId,
        network,
        asset,
      );
    } catch (err) {
      if (!isMissingTable(err, "platform_merchant_pair_rail_settings")) throw err;
    }
  }

  if (opts.siteId) {
    try {
      platformSiteNet = await getPlatformSiteNetworkRailSettings(
        opts.siteId,
        network,
      );
    } catch (err) {
      if (!isMissingTable(err, "platform_site_network_rail_settings")) throw err;
    }
    try {
      platformSitePair = await getPlatformSitePairRailSettings(
        opts.siteId,
        network,
        asset,
      );
    } catch (err) {
      if (!isMissingTable(err, "platform_site_pair_rail_settings")) throw err;
    }
  }

  // Self-serve raise: prefer the creating org (site if present), else merchant.
  const selfServeOrgId = opts.siteId || opts.orgId || null;
  if (selfServeOrgId) {
    try {
      merchantSelfServe = await getMerchantNetworkRailSettings(
        selfServeOrgId,
        network,
      );
    } catch (err) {
      if (!isMissingTable(err, "merchant_network_rail_settings")) throw err;
    }
    // If site has no self-serve row, also check billing merchant.
    if (
      !merchantSelfServe &&
      opts.siteId &&
      opts.orgId &&
      opts.orgId !== opts.siteId
    ) {
      try {
        merchantSelfServe = await getMerchantNetworkRailSettings(
          opts.orgId,
          network,
        );
      } catch (err) {
        if (!isMissingTable(err, "merchant_network_rail_settings")) throw err;
      }
    }
  }

  return resolveRailPolicy(asset, network, {
    platform: {
      requiredConfirmations: platformNet?.requiredConfirmations ?? null,
      minAmount: platformPair?.minAmount ?? null,
    },
    platformMerchant: {
      requiredConfirmations: platformMerchantNet?.requiredConfirmations ?? null,
      minAmount: platformMerchantPair?.minAmount ?? null,
    },
    platformSite: {
      requiredConfirmations: platformSiteNet?.requiredConfirmations ?? null,
      minAmount: platformSitePair?.minAmount ?? null,
    },
    merchant: merchantSelfServe
      ? { requiredConfirmations: merchantSelfServe.requiredConfirmations }
      : null,
  });
}

/**
 * Platform floor confirmations for a network (override or registry max).
 * @param {string} network
 */
export async function resolvePlatformFloorConfirmations(network) {
  const { registryNetworkFloors } = await import("./network-rail-settings-rules.mjs");
  const floors = registryNetworkFloors(network);
  let platform = null;
  try {
    platform = await getPlatformNetworkRailSettings(network);
  } catch (err) {
    if (!isMissingTable(err, "platform_network_rail_settings")) throw err;
  }
  if (platform?.requiredConfirmations != null) return platform.requiredConfirmations;
  return floors.requiredConfirmations ?? 1;
}

/**
 * Parent floor for a platform→merchant overlay (global / registry).
 * @param {string} network
 * @param {string} [asset]
 */
export async function resolveMerchantParentFloors(network, asset) {
  const { registryNetworkFloors } = await import("./network-rail-settings-rules.mjs");
  const floors = registryNetworkFloors(network);
  let platformNet = null;
  let platformPair = null;
  try {
    platformNet = await getPlatformNetworkRailSettings(network);
  } catch (err) {
    if (!isMissingTable(err, "platform_network_rail_settings")) throw err;
  }
  if (asset) {
    try {
      platformPair = await getPlatformPairRailSettings(network, asset);
    } catch (err) {
      if (!isMissingTable(err, "platform_pair_rail_settings")) throw err;
    }
  }
  const parentConfirmations =
    platformNet?.requiredConfirmations ?? floors.requiredConfirmations ?? 1;
  /** @param {string} a */
  const parentMinAmountForAsset = (a) => {
    const pair = getAssetNetworkConfig(a, network);
    if (!pair) return "0";
    if (platformPair && platformPair.asset === a && platformPair.minAmount != null) {
      return platformPair.minAmount;
    }
    // When called for a different asset than preloaded, fetch sync from registry only;
    // callers that need exact pair floor should pass asset or use async helper.
    return pair.minAmount;
  };
  // Prefer async pair lookup when asset provided
  let parentMinAmount = null;
  if (asset) {
    const pair = getAssetNetworkConfig(asset, network);
    parentMinAmount =
      platformPair?.minAmount ?? pair?.minAmount ?? floors.minAmount;
  }
  return {
    parentConfirmations,
    parentMinAmount,
    parentMinAmountForAsset: async (a) => {
      const pair = getAssetNetworkConfig(a, network);
      if (!pair) return "0";
      try {
        const row = await getPlatformPairRailSettings(network, a);
        return row?.minAmount ?? pair.minAmount;
      } catch (err) {
        if (!isMissingTable(err, "platform_pair_rail_settings")) throw err;
        return pair.minAmount;
      }
    },
    // sync fallback used by validators that need a function
    parentMinAmountForAssetSync: parentMinAmountForAsset,
  };
}

/**
 * Parent floor for a platform→site overlay (after merchant layer).
 * @param {string} network
 * @param {string | null} merchantOrgId
 * @param {string} [asset]
 */
export async function resolveSiteParentFloors(network, merchantOrgId, asset) {
  const merchantFloors = await resolveMerchantParentFloors(network, asset);
  let merchantNet = null;
  let merchantPair = null;
  if (merchantOrgId) {
    try {
      merchantNet = await getPlatformMerchantNetworkRailSettings(
        merchantOrgId,
        network,
      );
    } catch (err) {
      if (!isMissingTable(err, "platform_merchant_network_rail_settings")) throw err;
    }
    if (asset) {
      try {
        merchantPair = await getPlatformMerchantPairRailSettings(
          merchantOrgId,
          network,
          asset,
        );
      } catch (err) {
        if (!isMissingTable(err, "platform_merchant_pair_rail_settings")) throw err;
      }
    }
  }

  const parentConfirmations =
    merchantNet?.requiredConfirmations != null &&
    merchantNet.requiredConfirmations >= merchantFloors.parentConfirmations
      ? merchantNet.requiredConfirmations
      : merchantFloors.parentConfirmations;

  let parentMinAmount = merchantFloors.parentMinAmount;
  if (
    asset &&
    merchantPair?.minAmount != null &&
    parentMinAmount != null
  ) {
    const { compareAmount } = await import("./network-rail-settings-rules.mjs");
    if (compareAmount(merchantPair.minAmount, parentMinAmount) >= 0) {
      parentMinAmount = merchantPair.minAmount;
    }
  } else if (asset && merchantPair?.minAmount != null) {
    parentMinAmount = merchantPair.minAmount;
  }

  return {
    parentConfirmations,
    parentMinAmount,
    parentMinAmountForAsset: async (a) => {
      const baseMin = await merchantFloors.parentMinAmountForAsset(a);
      if (!merchantOrgId) return baseMin;
      try {
        const row = await getPlatformMerchantPairRailSettings(
          merchantOrgId,
          network,
          a,
        );
        if (row?.minAmount == null) return baseMin;
        const { compareAmount } = await import("./network-rail-settings-rules.mjs");
        return compareAmount(row.minAmount, baseMin) >= 0
          ? row.minAmount
          : baseMin;
      } catch (err) {
        if (!isMissingTable(err, "platform_merchant_pair_rail_settings")) throw err;
        return baseMin;
      }
    },
  };
}

/**
 * @returns {Promise<{
 *   confirmsByNet: Map<string, number | null>,
 *   minByPair: Map<string, string>,
 * }>}
 */
export async function loadPlatformRailOverlays() {
  const confirmsByNet = new Map();
  const minByPair = new Map();
  try {
    const nets = await listPlatformNetworkRailSettings();
    for (const row of nets) {
      confirmsByNet.set(row.network, row.requiredConfirmations);
    }
  } catch (err) {
    if (!isMissingTable(err, "platform_network_rail_settings")) throw err;
  }
  try {
    const pairs = await listPlatformPairRailSettings();
    for (const row of pairs) {
      minByPair.set(pairKey(row.network, row.asset), row.minAmount);
    }
  } catch (err) {
    if (!isMissingTable(err, "platform_pair_rail_settings")) throw err;
  }
  return { confirmsByNet, minByPair };
}

/** @deprecated use loadPlatformRailOverlays */
export async function loadPlatformRailOverlayMap() {
  const { confirmsByNet, minByPair } = await loadPlatformRailOverlays();
  const map = new Map();
  for (const [network, requiredConfirmations] of confirmsByNet) {
    map.set(network, { requiredConfirmations, minAmount: null });
  }
  // Legacy callers ignored pair mins — keep shape.
  void minByPair;
  return map;
}

export { pairKey };
