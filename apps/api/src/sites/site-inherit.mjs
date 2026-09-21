import { sendError } from "../http/json.mjs";
import { findBillingMerchantOrg } from "../orgs/org-ancestry.mjs";
import { findOrgById, listDescendantOrgsByType } from "../orgs/org-store.mjs";
import { parentIdOf, isSiteWalletKind } from "./site-override-rules.mjs";

/**
 * Resolve the org that owns wallet / matching / fulfillment settings.
 * Sites always inherit from the billing merchant (walk site → … → merchant).
 *
 * @param {object} org
 * @param {string} kind
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<{ orgId: string, source: "merchant" | "inherit" | "override", parentOrgId: string | null }>}
 */
export async function settingsLookupOrgId(org, _kind, _client) {
  if (org.type !== "merchant_site") {
    return { orgId: org.id, source: "merchant", parentOrgId: null };
  }
  const billing = await findBillingMerchantOrg(org);
  if (billing) {
    return { orgId: billing.id, source: "inherit", parentOrgId: billing.id };
  }
  const parentId = parentIdOf(org);
  return {
    orgId: parentId ?? org.id,
    source: "inherit",
    parentOrgId: parentId,
  };
}

/**
 * Sites that inherit this merchant's wallet share Mode C/D/S uniqueness.
 * Includes nested site descendants (unlimited depth).
 *
 * @param {object} org
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<string[]>}
 */
export async function walletGroupOrgIds(org, client) {
  const lookup = await settingsLookupOrgId(org, "settlement", client);
  const walletOrg =
    lookup.orgId === org.id ? org : await findOrgById(lookup.orgId);
  if (!walletOrg) return [org.id];
  if (walletOrg.type === "merchant_site") return [walletOrg.id];

  const sites = await listDescendantOrgsByType(
    walletOrg.id,
    "merchant_site",
    client,
  );
  const ids = [walletOrg.id];
  for (const site of sites) {
    const siteLookup = await settingsLookupOrgId(site, "settlement", client);
    if (siteLookup.orgId === walletOrg.id) ids.push(site.id);
  }
  return ids;
}

/**
 * @param {object} org
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function resolveSiteInherit(org, client) {
  const matching = await settingsLookupOrgId(org, "matching_mode", client);
  const fulfillment = await settingsLookupOrgId(org, "fulfillment_policy", client);
  const settlement = await settingsLookupOrgId(org, "settlement", client);
  const xpub = await settingsLookupOrgId(org, "xpub", client);
  return {
    matchingOrgId: matching.orgId,
    fulfillmentOrgId: fulfillment.orgId,
    settlementOrgId: settlement.orgId,
    xpubOrgId: xpub.orgId,
    walletGroupOrgIds: await walletGroupOrgIds(org, client),
  };
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {object} org
 * @param {string} kind
 * @param {{ platformOwner?: boolean }} caller
 * @returns {Promise<boolean>} true when the handler already sent 403
 */
export async function denySiteWriteWithoutOverride(res, org, kind, _caller) {
  if (org.type !== "merchant_site") return false;
  if (isSiteWalletKind(kind)) {
    sendError(
      res,
      403,
      "site_wallet_forbidden",
      "Site uses the parent merchant wallet; settlement and xPub cannot be set on a site",
    );
    return true;
  }
  sendError(
    res,
    403,
    "site_inherit_only",
    "Site inherits matching, fulfillment, and retention from the parent merchant",
  );
  return true;
}

/**
 * @param {object} org
 * @param {string} kind
 * @param {{ platformOwner?: boolean, userId: string }} caller
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function grantSiteOverrideAfterPlatformWrite(_org, _kind, _caller, _client) {
  /* Sites always inherit; platform writes matching/wallet on the parent merchant. */
}
