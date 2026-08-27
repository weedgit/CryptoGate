import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canChangeSettlementSettings,
  canViewSettlementSettings,
} from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { settlementAllowedOnOrgType } from "../settlement/settlement-rules.mjs";
import {
  denySiteWriteWithoutOverride,
  grantSiteOverrideAfterPlatformWrite,
  settingsLookupOrgId,
} from "../sites/site-inherit.mjs";
import { toRetentionSettings, validateRetentionBody } from "./retention-rules.mjs";
import {
  findRetentionSettings,
  upsertRetentionSettings,
} from "./retention-store.mjs";

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
  if (!settlementAllowedOnOrgType(org.type)) {
    sendError(
      res,
      400,
      "invalid_org_type",
      "Order retention is only valid on merchant orgs",
    );
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/orgs/{orgId}/retention
 */
export async function handleGetRetention(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canViewSettlementSettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to view order retention");
    return;
  }

  const lookup = await settingsLookupOrgId(loaded.org, "order_retention");
  const row = await findRetentionSettings(lookup.orgId);
  sendJson(res, 200, toRetentionSettings(row, orgId, lookup));
}

/**
 * PUT /v1/orgs/{orgId}/retention
 */
export async function handlePutRetention(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canChangeSettlementSettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to change order retention");
    return;
  }
  if (await denySiteWriteWithoutOverride(res, loaded.org, "order_retention", loaded.caller)) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateRetentionBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const row = await upsertRetentionSettings({
    orgId,
    orderDeleteDays: validated.parsed.orderDeleteDays,
  });
  await grantSiteOverrideAfterPlatformWrite(
    loaded.org,
    "order_retention",
    loaded.caller,
  );
  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgPolicyPut,
    metadata: { orderDeleteDays: validated.parsed.orderDeleteDays },
  });
  const lookup = await settingsLookupOrgId(loaded.org, "order_retention");
  sendJson(res, 200, toRetentionSettings(row, orgId, lookup));
}
