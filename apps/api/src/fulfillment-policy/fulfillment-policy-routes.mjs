import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canChangeFulfillmentPolicySettings,
  canViewFulfillmentPolicySettings,
} from "../orgs/role-policy.mjs";
import {
  fulfillmentPolicyAllowedOnOrgType,
  toFulfillmentPolicySettings,
  validateFulfillmentPolicyBody,
} from "./fulfillment-policy-rules.mjs";
import {
  findFulfillmentPolicySettings,
  upsertFulfillmentPolicySettings,
} from "./fulfillment-policy-store.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  denySiteWriteWithoutOverride,
  grantSiteOverrideAfterPlatformWrite,
  settingsLookupOrgId,
} from "../sites/site-inherit.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 */
async function loadVisibleMerchantOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }
  if (!fulfillmentPolicyAllowedOnOrgType(org.type)) {
    sendError(
      res,
      400,
      "invalid_org_type",
      "Fulfillment policy is only valid on merchant orgs",
    );
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/orgs/{orgId}/fulfillment-policy
 */
export async function handleGetFulfillmentPolicy(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canViewFulfillmentPolicySettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to view fulfillment policy");
    return;
  }

  const lookup = await settingsLookupOrgId(loaded.org, "fulfillment_policy");
  const row = await findFulfillmentPolicySettings(lookup.orgId);
  sendJson(res, 200, toFulfillmentPolicySettings(row, orgId, lookup));
}

/**
 * PUT /v1/orgs/{orgId}/fulfillment-policy
 */
export async function handlePutFulfillmentPolicy(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canChangeFulfillmentPolicySettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to change fulfillment policy");
    return;
  }
  if (
    await denySiteWriteWithoutOverride(
      res,
      loaded.org,
      "fulfillment_policy",
      loaded.caller,
    )
  ) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateFulfillmentPolicyBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const row = await upsertFulfillmentPolicySettings({
    orgId,
    fulfillmentPolicy: validated.parsed.fulfillmentPolicy,
  });
  await grantSiteOverrideAfterPlatformWrite(
    loaded.org,
    "fulfillment_policy",
    loaded.caller,
  );
  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.fulfillmentPolicyPut,
    metadata: { fulfillmentPolicy: validated.parsed.fulfillmentPolicy },
  });
  const lookup = await settingsLookupOrgId(loaded.org, "fulfillment_policy");
  sendJson(res, 200, toFulfillmentPolicySettings(row, orgId, lookup));
}
