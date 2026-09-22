import { readJsonBody, sendError, sendJson } from "./json.mjs";
import { requireCaller } from "./require-caller.mjs";
import {
  findUserById,
  setUserVerificationStatus,
  updateUserProfile,
} from "../auth/users.mjs";
import { listMembershipsForOrg } from "../orgs/membership-store.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { canUpdatePlatformOwnerSettings } from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";

/**
 * Resolve the Owner user for an org (first owner membership).
 * @param {string} orgId
 */
async function findOrgOwnerUser(orgId) {
  const team = await listMembershipsForOrg(orgId);
  const owner = team.find((m) => m.role === "owner") ?? null;
  if (!owner) return null;
  return findUserById(owner.userId);
}

/**
 * PATCH /v1/orgs/{orgId}/owner-profile — Platform Owner support-edit of Owner person profile.
 */
export async function handlePatchOrgOwnerProfile(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canUpdatePlatformOwnerSettings(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only Platform Owner may edit an organization Owner’s person profile",
    );
    return;
  }

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  const owner = await findOrgOwnerUser(orgId);
  if (!owner) {
    sendError(res, 404, "not_found", "Org owner not found");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  /** @type {{ firstName?: string | null, lastName?: string | null, timezone?: string }} */
  const patch = {};
  if (body?.firstName !== undefined) patch.firstName = body.firstName;
  if (body?.lastName !== undefined) patch.lastName = body.lastName;
  if (body?.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !body.timezone.trim()) {
      sendError(res, 400, "invalid_request", "timezone is required");
      return;
    }
    patch.timezone = body.timezone.trim();
  }

  const updated = await updateUserProfile(owner.id, patch);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.profileUpdate,
    metadata: {
      targetUserId: owner.id,
      supportEdit: true,
      firstName: patch.firstName !== undefined,
      lastName: patch.lastName !== undefined,
      timezone: patch.timezone !== undefined,
    },
  }).catch(() => {});

  sendJson(res, 200, {
    userId: updated.id,
    email: updated.email,
    firstName: updated.firstName,
    lastName: updated.lastName,
    timezone: updated.timezone,
    emailVerified: updated.emailVerified,
    phoneVerified: updated.phoneVerified,
    phone: updated.phone,
  });
}

/**
 * PUT /v1/orgs/{orgId}/owner-verification — Platform Owner overrides email/phone verified.
 */
export async function handlePutOrgOwnerVerification(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canUpdatePlatformOwnerSettings(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only Platform Owner may override verification status",
    );
    return;
  }

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  const owner = await findOrgOwnerUser(orgId);
  if (!owner) {
    sendError(res, 404, "not_found", "Org owner not found");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  /** @type {{ emailVerified?: boolean, phoneVerified?: boolean }} */
  const flags = {};
  if (typeof body?.emailVerified === "boolean") flags.emailVerified = body.emailVerified;
  if (typeof body?.phoneVerified === "boolean") flags.phoneVerified = body.phoneVerified;
  if (flags.emailVerified === undefined && flags.phoneVerified === undefined) {
    sendError(
      res,
      400,
      "invalid_request",
      "emailVerified and/or phoneVerified required",
    );
    return;
  }

  const updated = await setUserVerificationStatus(owner.id, flags);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.contactVerificationOverride,
    metadata: {
      targetUserId: owner.id,
      emailVerified: flags.emailVerified,
      phoneVerified: flags.phoneVerified,
    },
  }).catch(() => {});

  sendJson(res, 200, {
    userId: updated.id,
    email: updated.email,
    emailVerified: updated.emailVerified,
    phoneVerified: updated.phoneVerified,
    phone: updated.phone,
  });
}
