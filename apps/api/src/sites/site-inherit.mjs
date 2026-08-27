import { sendError } from "../http/json.mjs";
import { findOrgById, listChildOrgsByType } from "../orgs/org-store.mjs";
import { parentIdOf } from "./site-override-rules.mjs";
import {
  ensureApprovedOverride,
  hasApprovedOverride,
} from "./site-override-store.mjs";

/**
 * @param {object} org
 * @param {string} kind
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<{ orgId: string, source: "merchant" | "inherit" | "override", parentOrgId: string | null }>}
 */
export async function settingsLookupOrgId(org, kind, client) {
  const parentId = parentIdOf(org);
  if (org.type !== "merchant_site" || !parentId) {
    return { orgId: org.id, source: "merchant", parentOrgId: null };
  }
  if (await hasApprovedOverride(org.id, kind, client)) {
    return { orgId: org.id, source: "override", parentOrgId: parentId };
  }
  return { orgId: parentId, source: "inherit", parentOrgId: parentId };
}

/**
 * Sites that still inherit this merchant's wallet share Mode C/D/S uniqueness.
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

  const sites = await listChildOrgsByType(walletOrg.id, "merchant_site", client);
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
  const settlement = await settingsLookupOrgId(org, "settlement", client);
  const xpub = await settingsLookupOrgId(org, "xpub", client);
  return {
    matchingOrgId: matching.orgId,
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
export async function denySiteWriteWithoutOverride(res, org, kind, caller) {
  if (org.type !== "merchant_site") return false;
  if (caller.platformOwner) return false;
  if (await hasApprovedOverride(org.id, kind)) return false;
  sendError(
    res,
    403,
    "override_required",
    "Merchant (site) settings inherit from the parent until the merchant Owner approves an override",
  );
  return true;
}

/**
 * @param {object} org
 * @param {string} kind
 * @param {{ platformOwner?: boolean, userId: string }} caller
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function grantSiteOverrideAfterPlatformWrite(org, kind, caller, client) {
  if (org.type !== "merchant_site" || !caller.platformOwner) return;
  const parentId = parentIdOf(org);
  if (!parentId) return;
  await ensureApprovedOverride(
    {
      siteOrgId: org.id,
      parentOrgId: parentId,
      settingKind: kind,
      actorUserId: caller.userId,
    },
    client,
  );
}
