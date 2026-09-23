import { readJsonBody, sendError, sendJson } from "./json.mjs";
import { requireCaller } from "./require-caller.mjs";
import { normalizePhone } from "../auth/contact-otp-store.mjs";
import {
  clearUserPhone,
  findUserById,
  setUserEmail,
  setUserPhone,
  setUserVerificationStatus,
  updateUserPassword,
  updateUserProfile,
} from "../auth/users.mjs";
import {
  countOwners,
  findMembership,
  listMembershipsForOrg,
  updateMembershipRole,
} from "../orgs/membership-store.mjs";
import {
  isLastOwnerDemotion,
  roleAllowedOnOrg,
  USER_ROLES,
} from "../orgs/membership-rules.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
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

  if (!caller.platformOwner) {
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

  /** @type {{ firstName?: string | null, lastName?: string | null, timezone?: string, avatarUrl?: string | null }} */
  const patch = {};
  if (body?.firstName !== undefined) patch.firstName = body.firstName;
  if (body?.lastName !== undefined) patch.lastName = body.lastName;
  if (body?.avatarUrl !== undefined) patch.avatarUrl = body.avatarUrl;
  if (body?.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !body.timezone.trim()) {
      sendError(res, 400, "invalid_request", "timezone is required");
      return;
    }
    patch.timezone = body.timezone.trim();
  }

  let nextPhone;
  if (body?.phone !== undefined) {
    const raw = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!raw) {
      nextPhone = null;
    } else {
      nextPhone = normalizePhone(raw);
      if (!nextPhone) {
        sendError(
          res,
          400,
          "invalid_phone",
          "Phone must be an E.164 number, such as +15551234567",
        );
        return;
      }
    }
  }

  const nextPassword =
    typeof body?.password === "string" ? body.password : "";

  try {
    if (Object.keys(patch).length > 0) {
      const profile = await updateUserProfile(owner.id, patch);
      if (!profile) {
        sendError(res, 404, "not_found", "Org owner not found");
        return;
      }
    }
    if (typeof body?.email === "string" && body.email.trim()) {
      await setUserEmail(owner.id, body.email);
    }
    if (nextPhone === null) {
      await clearUserPhone(owner.id);
    } else if (typeof nextPhone === "string") {
      await setUserPhone(owner.id, nextPhone);
    }
    if (nextPassword) {
      await updateUserPassword(owner.id, nextPassword);
    }
  } catch (err) {
    const code = err && err.code ? String(err.code) : "invalid_request";
    const message = err instanceof Error ? err.message : "Could not update owner profile";
    const status = code === "email_taken" || code === "phone_taken" ? 409 : 400;
    sendError(res, status, code, message);
    return;
  }

  const updated = await findUserById(owner.id);
  if (!updated) {
    sendError(res, 404, "not_found", "Org owner not found");
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: nextPassword
      ? AUDIT_ACTIONS.passwordResetComplete
      : AUDIT_ACTIONS.profileUpdate,
    metadata: {
      targetUserId: owner.id,
      supportEdit: true,
      firstName: patch.firstName !== undefined,
      lastName: patch.lastName !== undefined,
      timezone: patch.timezone !== undefined,
      avatar: patch.avatarUrl !== undefined,
      email: typeof body?.email === "string",
      phone: body?.phone !== undefined,
      passwordReset: Boolean(nextPassword),
    },
  }).catch(() => {});

  sendJson(res, 200, ownerContactPayload(updated));
}

/**
 * PUT /v1/orgs/{orgId}/owner-verification — Platform Owner overrides email/phone verified.
 */
export async function handlePutOrgOwnerVerification(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!caller.platformOwner) {
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

  try {
    const { maybeCreateActivationForMerchantOrg } = await import(
      "../service-bills/activation.mjs"
    );
    if (org.type === "merchant") {
      await maybeCreateActivationForMerchantOrg(orgId);
    }
  } catch {
    /* best-effort */
  }

  sendJson(res, 200, ownerContactPayload(updated));
}

/**
 * @param {NonNullable<Awaited<ReturnType<typeof findUserById>>>} user
 */
function ownerContactPayload(user) {
  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    timezone: user.timezone,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    phone: user.phone,
    avatarUrl: user.avatarUrl ?? null,
    mfaEnrolled: user.mfaEnrolled === true,
  };
}

/**
 * @param {import("../auth/users.mjs").mapUserRow extends never ? never : Awaited<ReturnType<typeof findUserById>>} user
 * @param {{ role: string, orgType: string, status?: string }} membership
 */
function memberProfilePayload(user, membership) {
  return {
    userId: user.id,
    orgId: membership.orgId,
    email: user.email,
    role: membership.role,
    orgType: membership.orgType,
    status: membership.status === "paused" ? "paused" : "active",
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
  };
}

/**
 * PATCH /v1/orgs/{orgId}/members/{userId}
 * Platform Owner/Administrator edits a team member's contact, avatar, and role.
 */
export async function handlePatchOrgMember(req, res, orgId, userId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!caller.platformOperator) {
    sendError(
      res,
      403,
      "forbidden",
      "Only Platform Owner or Administrator may edit team member profiles",
    );
    return;
  }

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  const membership = await findMembership(orgId, userId, { includePaused: true });
  if (!membership) {
    sendError(res, 404, "not_found", "Membership not found");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const nextRole = typeof body?.role === "string" ? body.role.trim() : "";
  if (nextRole && (!USER_ROLES.includes(nextRole) || !roleAllowedOnOrg(nextRole, org.type))) {
    sendError(res, 400, "invalid_role", "Invalid role for this org");
    return;
  }
  if (nextRole && nextRole !== membership.role) {
    const owners = await countOwners(orgId);
    if (
      isLastOwnerDemotion({
        existingRole: membership.role,
        nextRole,
        ownerCount: owners,
      })
    ) {
      sendError(res, 403, "last_owner", "Cannot demote the last Owner");
      return;
    }
  }

  /** @type {{ firstName?: string | null, lastName?: string | null, timezone?: string, avatarUrl?: string | null }} */
  const patch = {};
  if (body?.firstName !== undefined) patch.firstName = body.firstName;
  if (body?.lastName !== undefined) patch.lastName = body.lastName;
  if (body?.avatarUrl !== undefined) patch.avatarUrl = body.avatarUrl;
  if (body?.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !body.timezone.trim()) {
      sendError(res, 400, "invalid_request", "timezone is required");
      return;
    }
    patch.timezone = body.timezone.trim();
  }

  let nextPhone;
  if (body?.phone !== undefined) {
    const raw = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!raw) {
      nextPhone = null;
    } else {
      nextPhone = normalizePhone(raw);
      if (!nextPhone) {
        sendError(
          res,
          400,
          "invalid_phone",
          "Phone must be an E.164 number, such as +15551234567",
        );
        return;
      }
    }
  }

  const nextPassword =
    typeof body?.password === "string" ? body.password : "";

  try {
    if (Object.keys(patch).length > 0) {
      const profile = await updateUserProfile(userId, patch);
      if (!profile) {
        sendError(res, 404, "not_found", "User not found");
        return;
      }
    }

    if (typeof body?.email === "string" && body.email.trim()) {
      await setUserEmail(userId, body.email);
    }

    if (nextPhone === null) {
      await clearUserPhone(userId);
    } else if (typeof nextPhone === "string") {
      await setUserPhone(userId, nextPhone);
    }

    if (nextPassword) {
      await updateUserPassword(userId, nextPassword);
    }
  } catch (err) {
    const code = err && err.code ? String(err.code) : "invalid_request";
    const message = err instanceof Error ? err.message : "Could not update member";
    const status = code === "email_taken" || code === "phone_taken" ? 409 : 400;
    sendError(res, status, code, message);
    return;
  }

  /** @type {{ emailVerified?: boolean, phoneVerified?: boolean }} */
  const flags = {};
  if (typeof body?.emailVerified === "boolean") flags.emailVerified = body.emailVerified;
  if (nextPhone === null) flags.phoneVerified = false;
  else if (typeof body?.phoneVerified === "boolean") flags.phoneVerified = body.phoneVerified;
  if (flags.emailVerified !== undefined || flags.phoneVerified !== undefined) {
    await setUserVerificationStatus(userId, flags);
  }

  if (nextRole && nextRole !== membership.role) {
    await updateMembershipRole(orgId, userId, nextRole);
  }

  const updated = await findUserById(userId);
  if (!updated) {
    sendError(res, 404, "not_found", "User not found");
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: nextPassword
      ? AUDIT_ACTIONS.passwordResetComplete
      : AUDIT_ACTIONS.profileUpdate,
    metadata: {
      targetUserId: userId,
      supportEdit: true,
      memberEdit: true,
      role: nextRole || membership.role,
      passwordReset: Boolean(nextPassword),
    },
  }).catch(() => {});

  sendJson(
    res,
    200,
    memberProfilePayload(updated, {
      orgId,
      role: nextRole || membership.role,
      orgType: org.type,
      status: membership.status,
    }),
  );
}
