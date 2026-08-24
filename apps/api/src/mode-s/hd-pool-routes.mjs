import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { canViewXpubSettings } from "../orgs/role-policy.mjs";
import { xpubAllowedOnOrgType } from "../xpub/xpub-rules.mjs";
import { toHdPoolList } from "./hd-pool-rules.mjs";
import { listHdPoolAddresses } from "./hd-pool-store.mjs";

/**
 * GET /v1/orgs/{orgId}/hd-pool — watch-only derived addresses (never xPub).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 */
export async function handleGetHdPool(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  if (!xpubAllowedOnOrgType(org.type)) {
    sendError(
      res,
      400,
      "invalid_org_type",
      "HD pool is only valid on merchant orgs",
    );
    return;
  }
  if (!canViewXpubSettings(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to view HD pool");
    return;
  }

  const rows = await listHdPoolAddresses(orgId);
  sendJson(res, 200, toHdPoolList(rows));
}
