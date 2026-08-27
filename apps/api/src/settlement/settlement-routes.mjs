import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canChangeSettlementSettings,
  canViewSettlementSettings,
} from "../orgs/role-policy.mjs";
import { findUserMfaById } from "../auth/users.mjs";
import { verifyTotp } from "../auth/totp.mjs";
import {
  settlementAllowedOnOrgType,
  settlementCooldownMs,
  toSettlementAddress,
  validateSettlementBody,
} from "./settlement-rules.mjs";
import {
  listSettlementAddresses,
  upsertSettlementAddress,
} from "./settlement-store.mjs";
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
  if (!settlementAllowedOnOrgType(org.type)) {
    sendError(res, 400, "invalid_org_type", "Settlement address is only valid on merchant orgs");
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/orgs/{orgId}/settlement
 */
export async function handleGetSettlement(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canViewSettlementSettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to view settlement settings");
    return;
  }

  const lookup = await settingsLookupOrgId(loaded.org, "settlement");
  const rows = await listSettlementAddresses(lookup.orgId);
  sendJson(res, 200, {
    items: rows.map(toSettlementAddress),
    source: lookup.source,
    parentOrgId: lookup.parentOrgId,
    effectiveOrgId: lookup.orgId,
  });
}

/**
 * PUT /v1/orgs/{orgId}/settlement — MFA + cool-down (M2-16).
 */
export async function handlePutSettlement(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canChangeSettlementSettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to change settlement address");
    return;
  }
  if (await denySiteWriteWithoutOverride(res, loaded.org, "settlement", loaded.caller)) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateSettlementBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const user = await findUserMfaById(loaded.caller.userId);
  if (!user?.mfaEnrolled || !user.mfaSecret) {
    sendError(
      res,
      403,
      "mfa_required",
      "MFA enrollment is required to change settlement address",
    );
    return;
  }
  if (!verifyTotp(user.mfaSecret, validated.parsed.mfaCode)) {
    sendError(res, 401, "invalid_mfa", "Invalid MFA code");
    return;
  }

  const result = await upsertSettlementAddress({
    orgId,
    asset: validated.parsed.asset,
    network: validated.parsed.network,
    address: validated.parsed.address,
    cooldownMs: settlementCooldownMs(),
  });

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.settlementPut,
    metadata: {
      asset: validated.parsed.asset,
      network: validated.parsed.network,
      address: validated.parsed.address,
      kind: result.kind,
      pendingActivatesAt: result.row.pending_activates_at
        ? new Date(result.row.pending_activates_at).toISOString()
        : null,
    },
  });
  await grantSiteOverrideAfterPlatformWrite(loaded.org, "settlement", loaded.caller);
  sendJson(res, 200, toSettlementAddress(result.row));
}
