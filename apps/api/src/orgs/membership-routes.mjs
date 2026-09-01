import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { revokeAllSessionsForUser } from "../auth/sessions.mjs";
import { findUserById } from "../auth/users.mjs";
import { findOrgById } from "./org-store.mjs";
import {
  canAssignOrgRole,
  canInviteToOrg,
  canListOrgUsers,
  canManageMembershipLifecycle,
  isLastActiveOwnerLifecycleBlock,
  isLastOwnerDemotion,
  MEMBERSHIP_STATUSES,
  roleAllowedOnOrg,
  toOrgMembership,
  USER_ROLES,
} from "./membership-rules.mjs";
import {
  countOrgMemberships,
  countOwners,
  deleteMembership,
  findMembership,
  insertMembership,
  listMemberEmailsGroupedByOrg,
  listMembershipsForOrg,
  listMembershipsForUser,
  provisionUserForInvite,
  updateMembershipRole,
  updateMembershipStatus,
} from "./membership-store.mjs";
import { canListOrgMemberEmailsBulk } from "./role-policy.mjs";
import { isVisibleOrg, listVisibleOrgs, roleOnOrg } from "./org-access.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { createPasswordResetToken } from "../auth/password-reset-store.mjs";
import { sendInviteEmail } from "../mail/auth-mail.mjs";
import {
  inviteRelativePathForToken,
  inviteUrlForToken,
  portalLoginUrl,
} from "../mail/portal-links.mjs";

async function memberEmailForAudit(userId) {
  const user = await findUserById(userId);
  return user?.email?.trim() || null;
}

/**
 * Shared org visibility + existence for membership routes.
 * @returns {Promise<{ org: object } | null>}
 */
async function loadVisibleOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const org = await findOrgById(orgId);
  if (!org) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!caller.platformOperator && !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/org-member-emails?types=agent,agent_sub
 * GET /v1/platform/org-member-emails (alias)
 * GET /v1/platform/org-emails (alias)
 * Bulk member emails for orgs visible to the caller.
 */
export async function handleListOrgMemberEmails(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canListOrgMemberEmailsBulk(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to list org member emails");
    return;
  }

  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  const visibleIds = visible.map((row) => row.id);
  const typesParam = url.searchParams.get("types");
  const orgTypes =
    typesParam && typesParam.trim()
      ? typesParam
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : null;

  const items = await listMemberEmailsGroupedByOrg(visibleIds, orgTypes);
  sendJson(res, 200, { items });
}

/** @deprecated Alias for handleListOrgMemberEmails */
export const handleListPlatformOrgMemberEmails = handleListOrgMemberEmails;

/**
 * GET /v1/orgs/{orgId}/users
 */
export async function handleListOrgUsers(req, res, orgId) {
  const loaded = await loadVisibleOrg(req, res, orgId);
  if (!loaded) return;
  const { caller, org } = loaded;

  const memberRole = roleOnOrg(caller.memberships, orgId);
  if (!canListOrgUsers(memberRole, caller.platformOperator)) {
    sendError(res, 403, "forbidden", "Not allowed to list org members");
    return;
  }

  const items = await listMembershipsForOrg(org.id);
  sendJson(res, 200, { items });
}

/**
 * POST /v1/orgs/{orgId}/users
 */
export async function handleInviteOrgUser(req, res, orgId) {
  const loaded = await loadVisibleOrg(req, res, orgId);
  if (!loaded) return;
  const { caller, org } = loaded;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const email = typeof body?.email === "string" ? body.email : "";
  const role =
    typeof body?.role === "string" ? body.role.trim().toLowerCase() : "";
  if (!email || !role) {
    sendError(res, 400, "invalid_request", "Email and role are required");
    return;
  }
  if (!USER_ROLES.includes(role)) {
    sendError(res, 400, "invalid_role", "Unknown role");
    return;
  }
  if (!roleAllowedOnOrg(role, org.type)) {
    sendError(
      res,
      400,
      "invalid_role",
      role === "cashier"
        ? "Cashier is only valid on merchant or merchant-site accounts"
        : "That role is not allowed on this organization",
    );
    return;
  }

  const memberCount = await countOrgMemberships(orgId);
  if (
    !canInviteToOrg({
      platformOwner: caller.platformOwner,
      platformOperator: caller.platformOperator,
      roleOnOrg: roleOnOrg(caller.memberships, orgId),
      roleOnParent: org.parent_id ? roleOnOrg(caller.memberships, org.parent_id) : null,
      memberCount,
      invitedRole: role,
    })
  ) {
    sendError(res, 403, "forbidden", "Only the org Owner may manage team");
    return;
  }

  let provisioned;
  try {
    provisioned = await provisionUserForInvite(email);
  } catch (err) {
    if (err && err.code === "email_invalid") {
      sendError(res, 400, "email_invalid", err.message);
      return;
    }
    throw err;
  }

  const user = { id: provisioned.id, email: provisioned.email };
  const profile = await findUserById(user.id);

  if (!provisioned.created) {
    const memberships = await listMembershipsForUser(user.id);
    if (memberships.some((m) => m.orgId !== orgId)) {
      sendError(
        res,
        409,
        "email_taken",
        "This email is already registered on the platform.",
      );
      return;
    }
  }

  const existing = await findMembership(orgId, user.id, { includePaused: true });
  if (existing) {
    sendError(
      res,
      400,
      "membership_exists",
      existing.status === "paused"
        ? "User is already a member (paused). Resume instead of inviting again."
        : "User is already a member of this org",
    );
    return;
  }

  const inserted = await insertMembership({
    orgId,
    userId: user.id,
    role,
  });
  if (!inserted.ok) {
    sendError(res, 400, "membership_exists", "User is already a member of this org");
    return;
  }

  /** @type {string | null} */
  let temporaryPassword = provisioned.temporaryPassword;
  /** @type {string | null} */
  let invitePath = null;
  /** @type {string | null} */
  let inviteUrl = null;
  /** @type {{ status: string, mode: string }} */
  let emailDelivery = { status: "skipped", mode: "none" };

  if (provisioned.created && temporaryPassword) {
    const rawToken = await createPasswordResetToken(user.id);
    invitePath = inviteRelativePathForToken(rawToken);
    inviteUrl = inviteUrlForToken(org.type, rawToken);
    const loginUrl = portalLoginUrl(org.type);
    const mail = await sendInviteEmail({
      to: user.email,
      orgName: org.name ?? org.type,
      role,
      temporaryPassword,
      inviteUrl,
      loginUrl,
    });
    emailDelivery = { status: mail.delivered ? "sent" : "stubbed", mode: mail.mode };
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgUserInvite,
    metadata: {
      email: user.email,
      displayName: profile?.displayName ?? null,
      invitedUserId: user.id,
      role,
      provisioned: provisioned.created,
    },
  });

  sendJson(res, 201, {
    ...toOrgMembership({
      orgId,
      userId: user.id,
      role,
      orgType: org.type,
      status: "active",
    }),
    temporaryPassword,
    invitePath,
    inviteUrl,
    emailDelivery,
  });
}

/**
 * PUT /v1/orgs/{orgId}/users/{userId}/role
 */
export async function handleAssignOrgUserRole(req, res, orgId, userId) {
  const loaded = await loadVisibleOrg(req, res, orgId);
  if (!loaded) return;
  const { caller, org } = loaded;

  if (
    !canAssignOrgRole({
      platformOwner: caller.platformOwner,
      roleOnOrg: roleOnOrg(caller.memberships, orgId),
    })
  ) {
    sendError(res, 403, "forbidden", "Only the org Owner may manage team");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const role = typeof body?.role === "string" ? body.role : "";
  if (!USER_ROLES.includes(role) || !roleAllowedOnOrg(role, org.type)) {
    sendError(res, 400, "invalid_role", "Invalid role for this org");
    return;
  }

  const existing = await findMembership(orgId, userId, { includePaused: true });
  if (!existing) {
    sendError(res, 404, "not_found", "Membership not found");
    return;
  }

  const owners = await countOwners(orgId);
  if (
    isLastOwnerDemotion({
      existingRole: existing.role,
      nextRole: role,
      ownerCount: owners,
    })
  ) {
    sendError(res, 403, "last_owner", "Cannot demote the last Owner");
    return;
  }

  await updateMembershipRole(orgId, userId, role);
  const targetEmail = await memberEmailForAudit(userId);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgUserRole,
    metadata: { targetUserId: userId, email: targetEmail, role },
  });
  sendJson(
    res,
    200,
    toOrgMembership({
      orgId,
      userId,
      role,
      orgType: org.type,
      status: existing.status,
    }),
  );
}

/**
 * PUT /v1/orgs/{orgId}/users/{userId}/status
 */
export async function handleSetOrgUserStatus(req, res, orgId, userId) {
  const loaded = await loadVisibleOrg(req, res, orgId);
  if (!loaded) return;
  const { caller, org } = loaded;

  if (
    !canManageMembershipLifecycle({
      platformOwner: caller.platformOwner,
      roleOnOrg: roleOnOrg(caller.memberships, orgId),
    })
  ) {
    sendError(res, 403, "forbidden", "Only the org Owner may manage team");
    return;
  }

  if (caller.userId === userId) {
    sendError(res, 403, "forbidden", "Cannot change your own membership status");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const status = typeof body?.status === "string" ? body.status : "";
  if (!MEMBERSHIP_STATUSES.includes(status)) {
    sendError(res, 400, "invalid_request", "status must be active or paused");
    return;
  }

  const existing = await findMembership(orgId, userId, { includePaused: true });
  if (!existing) {
    sendError(res, 404, "not_found", "Membership not found");
    return;
  }

  if (status === "paused") {
    const owners = await countOwners(orgId);
    if (
      isLastActiveOwnerLifecycleBlock({
        role: existing.role,
        status: existing.status,
        activeOwnerCount: owners,
      })
    ) {
      sendError(res, 403, "last_owner", "Cannot pause the last active Owner");
      return;
    }
  }

  if (existing.status === status) {
    sendJson(
      res,
      200,
      toOrgMembership({
        orgId,
        userId,
        role: existing.role,
        orgType: org.type,
        status,
      }),
    );
    return;
  }

  await updateMembershipStatus(orgId, userId, status);
  await revokeAllSessionsForUser(userId);
  const targetEmail = await memberEmailForAudit(userId);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action:
      status === "paused" ? AUDIT_ACTIONS.orgUserPause : AUDIT_ACTIONS.orgUserResume,
    metadata: { targetUserId: userId, email: targetEmail, status },
  });

  sendJson(
    res,
    200,
    toOrgMembership({
      orgId,
      userId,
      role: existing.role,
      orgType: org.type,
      status,
    }),
  );
}

/**
 * DELETE /v1/orgs/{orgId}/users/{userId}
 */
export async function handleRemoveOrgUser(req, res, orgId, userId) {
  const loaded = await loadVisibleOrg(req, res, orgId);
  if (!loaded) return;
  const { caller } = loaded;

  if (
    !canManageMembershipLifecycle({
      platformOwner: caller.platformOwner,
      roleOnOrg: roleOnOrg(caller.memberships, orgId),
    })
  ) {
    sendError(res, 403, "forbidden", "Only the org Owner may manage team");
    return;
  }

  if (caller.userId === userId) {
    sendError(res, 403, "forbidden", "Cannot remove yourself from the org");
    return;
  }

  const existing = await findMembership(orgId, userId, { includePaused: true });
  if (!existing) {
    sendError(res, 404, "not_found", "Membership not found");
    return;
  }

  const owners = await countOwners(orgId);
  if (
    isLastActiveOwnerLifecycleBlock({
      role: existing.role,
      status: existing.status,
      activeOwnerCount: owners,
    })
  ) {
    sendError(res, 403, "last_owner", "Cannot remove the last active Owner");
    return;
  }

  await deleteMembership(orgId, userId);
  await revokeAllSessionsForUser(userId);
  const targetEmail = await memberEmailForAudit(userId);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgUserRemove,
    metadata: {
      targetUserId: userId,
      email: targetEmail,
      priorRole: existing.role,
      priorStatus: existing.status,
    },
  });

  res.writeHead(204);
  res.end();
}
