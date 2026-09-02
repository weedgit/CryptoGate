import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { canViewSiteOverrides } from "../orgs/role-policy.mjs";
import { parentIdOf } from "./site-override-rules.mjs";
import { toSiteSettingOverride } from "./site-override-rules.mjs";
import { listOverridesForSite } from "./site-override-store.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 */
async function loadVisibleSite(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }
  if (org.type !== "merchant_site") {
    sendError(
      res,
      400,
      "invalid_org_type",
      "Setting overrides are only valid on merchant (site) orgs",
    );
    return null;
  }
  const parentId = parentIdOf(org);
  if (!parentId) {
    sendError(res, 400, "invalid_request", "Site is missing a parent merchant");
    return null;
  }
  return { caller, org, parentId };
}

function inheritOnly(res) {
  sendError(
    res,
    403,
    "site_inherit_only",
    "Merchant (site) inherits matching, fulfillment, and retention from the parent merchant",
  );
}

/**
 * GET /v1/orgs/{orgId}/setting-overrides
 */
export async function handleListSiteOverrides(req, res, orgId) {
  const loaded = await loadVisibleSite(req, res, orgId);
  if (!loaded) return;

  if (!canViewSiteOverrides(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to view site setting overrides");
    return;
  }

  const rows = await listOverridesForSite(orgId);
  sendJson(res, 200, { items: rows.map(toSiteSettingOverride) });
}

/**
 * POST /v1/orgs/{orgId}/setting-overrides — sites always inherit; no requests.
 */
export async function handleRequestSiteOverride(req, res, orgId) {
  const loaded = await loadVisibleSite(req, res, orgId);
  if (!loaded) return;
  inheritOnly(res);
}

/**
 * PATCH /v1/orgs/{orgId}/setting-overrides/{overrideId} — no decide path.
 */
export async function handleDecideSiteOverride(req, res, orgId, _overrideId) {
  const loaded = await loadVisibleSite(req, res, orgId);
  if (!loaded) return;
  inheritOnly(res);
}
