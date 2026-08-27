import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canDecideSiteOverride,
  canRequestSiteOverride,
  canViewSiteOverrides,
} from "../orgs/role-policy.mjs";
import { findUserMfaById } from "../auth/users.mjs";
import { verifyTotp } from "../auth/totp.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { applyApprovedOverride } from "./site-override-apply.mjs";
import { parentIdOf } from "./site-override-rules.mjs";
import {
  toSiteSettingOverride,
  validateOverrideDecideBody,
  validateOverrideRequestBody,
} from "./site-override-rules.mjs";
import {
  decideOverride,
  findOverrideById,
  hasApprovedOverride,
  insertPendingOverride,
  listOverridesForSite,
} from "./site-override-store.mjs";

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
 * POST /v1/orgs/{orgId}/setting-overrides
 */
export async function handleRequestSiteOverride(req, res, orgId) {
  const loaded = await loadVisibleSite(req, res, orgId);
  if (!loaded) return;

  if (!canRequestSiteOverride(loaded.caller, loaded.org)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only the site Owner or Administrator may request an override",
    );
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateOverrideRequestBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  if (await hasApprovedOverride(orgId, validated.parsed.settingKind)) {
    sendError(
      res,
      409,
      "override_already_approved",
      "This setting already has an approved override; update it on the site settings endpoints",
    );
    return;
  }

  let row;
  try {
    row = await insertPendingOverride({
      siteOrgId: orgId,
      parentOrgId: loaded.parentId,
      settingKind: validated.parsed.settingKind,
      payload: validated.parsed.payload,
      requestedBy: loaded.caller.userId,
    });
  } catch (err) {
    if (err && err.code === "23505") {
      sendError(
        res,
        409,
        "override_pending",
        "A pending override already exists for this setting",
      );
      return;
    }
    throw err;
  }

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.siteOverrideRequest,
    metadata: { settingKind: validated.parsed.settingKind },
  });
  sendJson(res, 201, toSiteSettingOverride(row));
}

/**
 * PATCH /v1/orgs/{orgId}/setting-overrides/{overrideId}
 */
export async function handleDecideSiteOverride(req, res, orgId, overrideId) {
  const loaded = await loadVisibleSite(req, res, orgId);
  if (!loaded) return;

  if (!canDecideSiteOverride(loaded.caller, loaded.org)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only the parent merchant Owner may approve or deny site overrides",
    );
    return;
  }

  const existing = await findOverrideById(overrideId);
  if (!existing || existing.site_org_id !== orgId || existing.status !== "pending") {
    sendError(res, 404, "not_found", "Pending override not found");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateOverrideDecideBody(body, existing.setting_kind);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  if (validated.parsed.mfaCode) {
    const user = await findUserMfaById(loaded.caller.userId);
    if (!user?.mfaEnrolled || !user.mfaSecret) {
      sendError(
        res,
        403,
        "mfa_required",
        "MFA enrollment is required to approve settlement or xPub overrides",
      );
      return;
    }
    if (!verifyTotp(user.mfaSecret, validated.parsed.mfaCode)) {
      sendError(res, 401, "invalid_mfa", "Invalid MFA code");
      return;
    }
  }

  const status = validated.parsed.decision === "approve" ? "approved" : "denied";
  const row = await decideOverride(overrideId, {
    status,
    decidedBy: loaded.caller.userId,
  });
  if (!row) {
    sendError(res, 404, "not_found", "Pending override not found");
    return;
  }

  if (status === "approved") {
    await applyApprovedOverride(row);
  }

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.siteOverrideDecide,
    metadata: {
      overrideId,
      settingKind: existing.setting_kind,
      decision: validated.parsed.decision,
      reason: validated.parsed.reason,
    },
  });
  sendJson(res, 200, toSiteSettingOverride(row));
}
