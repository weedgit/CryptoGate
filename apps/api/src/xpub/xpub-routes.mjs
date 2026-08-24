import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canChangeXpubSettings,
  canViewXpubSettings,
} from "../orgs/role-policy.mjs";
import { findUserMfaById } from "../auth/users.mjs";
import { verifyTotp } from "../auth/totp.mjs";
import {
  toXpubSettings,
  validateXpubBody,
  xpubAllowedOnOrgType,
  xpubCooldownMs,
} from "./xpub-rules.mjs";
import { listXpubs, upsertXpub } from "./xpub-store.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";

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
  if (!xpubAllowedOnOrgType(org.type)) {
    sendError(res, 400, "invalid_org_type", "xPub is only valid on merchant orgs");
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/orgs/{orgId}/xpub — presence only (no full xPub).
 */
export async function handleGetXpub(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canViewXpubSettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to view xPub settings");
    return;
  }

  const rows = await listXpubs(orgId);
  sendJson(res, 200, { items: rows.map(toXpubSettings) });
}

/**
 * PUT /v1/orgs/{orgId}/xpub — MFA + cool-down (M2-20).
 */
export async function handlePutXpub(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canChangeXpubSettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to change xPub");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateXpubBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const user = await findUserMfaById(loaded.caller.userId);
  if (!user?.mfaEnrolled || !user.mfaSecret) {
    sendError(res, 403, "mfa_required", "MFA enrollment is required to change xPub");
    return;
  }
  if (!verifyTotp(user.mfaSecret, validated.parsed.mfaCode)) {
    sendError(res, 401, "invalid_mfa", "Invalid MFA code");
    return;
  }

  const result = await upsertXpub({
    orgId,
    asset: validated.parsed.asset,
    network: validated.parsed.network,
    xPub: validated.parsed.xPub,
    cooldownMs: xpubCooldownMs(),
  });

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.xpubPut,
    metadata: {
      asset: validated.parsed.asset,
      network: validated.parsed.network,
      kind: result.kind,
      pendingActivatesAt: result.row.pending_activates_at
        ? new Date(result.row.pending_activates_at).toISOString()
        : null,
    },
  });
  sendJson(res, 200, toXpubSettings(result.row));
}
