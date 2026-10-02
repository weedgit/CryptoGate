import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { revokeAllSessionsForUser } from "../auth/sessions.mjs";
import {
  clearUserPosPin,
  findUserByEmail,
  findUserById,
  generateUserPosPin,
  tombstoneUsersWithoutMemberships,
  userHasPosPin,
} from "../auth/users.mjs";
import { collectAncestorOrgIds } from "./org-ancestry.mjs";
import {
  canAssignOrgRole,
  canInviteToOrg,
  canListOrgUsers,
  canManageMemberPosPin,
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
  provisionUserForInvite,
  updateMembershipRole,
  updateMembershipStatus,
} from "./membership-store.mjs";
import {
  findOrgById,
  resolveBusinessTimezone,
  updateOrgBillingEmailIfEmpty,
} from "./org-store.mjs";
import {
  canCompleteEmptySiteOnboarding,
  canListOrgMemberEmailsBulk,
  canManageDirectChildOrg,
  effectiveRoleOnOrg,
} from "./role-policy.mjs";
import { isVisibleOrg, listVisibleOrgs, roleOnOrg } from "./org-access.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { createPasswordResetToken } from "../auth/password-reset-store.mjs";
import { sendInviteEmail } from "../mail/auth-mail.mjs";
import {
  AgentNotificationEventType,
  PlatformNotificationEventType,
  notifyAgentOrg,
  notifyPlatform,
} from "../notifications/notify.mjs";
import {
  inviteRelativePathForToken,
  inviteUrlForToken,
  portalLoginUrl,
} from "../mail/portal-links.mjs";

const EMAIL_TAKEN_MESSAGE =
  "This email is already registered. Each email can belong to only one account.";

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
 * GET /v1/org-member-emails?types=agent,merchant
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

  const memberRole = await effectiveRoleOnOrg(caller, org);
  const ancestors = await collectAncestorOrgIds(org);
  const mayList =
    canListOrgUsers(memberRole, caller.platformOperator) ||
    (!caller.platformOperator &&
      canManageDirectChildOrg(caller, org, ancestors));
  if (!mayList) {
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
  const mayInvite =
    canInviteToOrg({
      platformOwner: caller.platformOwner,
      platformOperator: caller.platformOperator,
      roleOnOrg: await effectiveRoleOnOrg(caller, org),
      roleOnParent: org.parent_id ? roleOnOrg(caller.memberships, org.parent_id) : null,
      memberCount,
      invitedRole: role,
    }) ||
    (role === "owner" &&
      (await canCompleteEmptySiteOnboarding(caller, org, memberCount, findOrgById)));
  if (!mayInvite) {
    sendError(res, 403, "forbidden", "Only the org Owner may manage team");
    return;
  }

  // One email = one account in one org with one role; registered emails cannot be invited.
  const registered = await findUserByEmail(email);
  if (registered) {
    const existing = await findMembership(orgId, registered.id, { includePaused: true });
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
    sendError(res, 409, "email_taken", EMAIL_TAKEN_MESSAGE);
    return;
  }

  let provisioned;
  try {
    provisioned = await provisionUserForInvite(email, {
      timezone: await inviteDefaultTimezone(org.id, caller.userId),
    });
  } catch (err) {
    if (err && err.code === "email_invalid") {
      sendError(res, 400, "email_invalid", err.message);
      return;
    }
    if (err && err.code === "email_taken") {
      sendError(res, 409, "email_taken", EMAIL_TAKEN_MESSAGE);
      return;
    }
    throw err;
  }

  const user = { id: provisioned.id, email: provisioned.email };
  const profile = await findUserById(user.id);

  const inserted = await insertMembership({
    orgId,
    userId: user.id,
    role,
  });
  if (!inserted.ok) {
    sendError(res, 400, "membership_exists", "User is already a member of this org");
    return;
  }

  if (role === "owner") {
    await updateOrgBillingEmailIfEmpty(orgId, user.email).catch(() => null);
  }

  const { temporaryPassword } = provisioned;
  const rawToken = await createPasswordResetToken(user.id);
  const invitePath = inviteRelativePathForToken(rawToken);
  const inviteUrl = inviteUrlForToken(org.type, rawToken);
  const mail = await sendInviteEmail({
    to: user.email,
    orgName: org.name ?? org.type,
    role,
    temporaryPassword,
    inviteUrl,
    loginUrl: portalLoginUrl(org.type),
  });
  const emailDelivery = { status: mail.delivered ? "sent" : "stubbed", mode: mail.mode };

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgUserInvite,
    metadata: {
      email: user.email,
      displayName: profile?.displayName ?? null,
      invitedUserId: user.id,
      role,
      provisioned: true,
      orgType: org.type,
      ...(org.type === "agent" || org.type === "merchant"
        ? { initialSignIn: temporaryPassword }
        : {}),
    },
  });

  if (org.type === "agent") {
    const who = profile?.displayName ? `${profile.displayName} (${user.email})` : user.email;
    notifyAgentOrg(
      orgId,
      AgentNotificationEventType.TeamMemberJoined,
      {
        subject: `New team member — ${org.name ?? "your agent team"}`,
        lines: [`${who} was added to ${org.name ?? "your agent team"} as ${role}.`],
        path: "settings/team",
      },
      { excludeUserId: user.id },
    );
  }

  if (org.type === "platform") {
    const who = profile?.displayName ? `${profile.displayName} (${user.email})` : user.email;
    notifyPlatform(
      PlatformNotificationEventType.TeamMemberJoined,
      {
        subject: "New platform team member",
        lines: [`${who} was added to the platform team as ${role}.`],
        path: "settings/team",
      },
      { excludeUserId: user.id },
    );
  }

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
      platformOperator: caller.platformOperator,
      roleOnOrg: await effectiveRoleOnOrg(caller, org),
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
      platformOperator: caller.platformOperator,
      roleOnOrg: await effectiveRoleOnOrg(caller, org),
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
  const { caller, org } = loaded;

  if (
    !canManageMembershipLifecycle({
      platformOwner: caller.platformOwner,
      platformOperator: caller.platformOperator,
      roleOnOrg: await effectiveRoleOnOrg(caller, org),
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

  const targetEmail = await memberEmailForAudit(userId);
  await deleteMembership(orgId, userId);
  await revokeAllSessionsForUser(userId);
  const deleted = await tombstoneUsersWithoutMemberships([userId]);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgUserRemove,
    metadata: {
      targetUserId: userId,
      email: targetEmail,
      priorRole: existing.role,
      priorStatus: existing.status,
      accountDeleted: deleted.length > 0,
    },
  });

  res.writeHead(204);
  res.end();
}

/**
 * PUT /v1/orgs/{orgId}/users/{userId}/pos-pin — Owner/Admin set member POS PIN (no current PIN).
 */
export async function handleAdminPutMemberPosPin(req, res, orgId, userId) {
  const loaded = await loadVisibleOrg(req, res, orgId);
  if (!loaded) return;
  const { caller, org } = loaded;

  if (
    !canManageMemberPosPin({
      platformOwner: caller.platformOwner,
      platformOperator: caller.platformOperator,
      roleOnOrg: await effectiveRoleOnOrg(caller, org),
    })
  ) {
    sendError(
      res,
      403,
      "forbidden",
      "Only Owner or Administrator may set a member POS PIN",
    );
    return;
  }

  if (org.type !== "merchant" && org.type !== "merchant_site") {
    sendError(
      res,
      400,
      "invalid_request",
      "POS PIN applies to merchant org members only",
    );
    return;
  }

  const existing = await findMembership(orgId, userId, { includePaused: true });
  if (!existing) {
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

  if (body?.generate !== true) {
    sendError(
      res,
      400,
      "pos_pin_generate_only",
      'POS PINs are generated by the server. Send { "generate": true }.',
    );
    return;
  }

  const pin = await generateUserPosPin(userId, orgId);
  const targetEmail = await memberEmailForAudit(userId);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.posPinGenerated,
    metadata: { targetUserId: userId, email: targetEmail, role: existing.role },
  });
  sendJson(res, 200, { configured: true, pin });
}

/**
 * DELETE /v1/orgs/{orgId}/users/{userId}/pos-pin — Owner/Admin clear member POS PIN.
 */
export async function handleAdminDeleteMemberPosPin(req, res, orgId, userId) {
  const loaded = await loadVisibleOrg(req, res, orgId);
  if (!loaded) return;
  const { caller, org } = loaded;

  if (
    !canManageMemberPosPin({
      platformOwner: caller.platformOwner,
      platformOperator: caller.platformOperator,
      roleOnOrg: await effectiveRoleOnOrg(caller, org),
    })
  ) {
    sendError(
      res,
      403,
      "forbidden",
      "Only Owner or Administrator may clear a member POS PIN",
    );
    return;
  }

  if (org.type !== "merchant" && org.type !== "merchant_site") {
    sendError(
      res,
      400,
      "invalid_request",
      "POS PIN applies to merchant org members only",
    );
    return;
  }

  const existing = await findMembership(orgId, userId, { includePaused: true });
  if (!existing) {
    sendError(res, 404, "not_found", "Membership not found");
    return;
  }

  const had = await userHasPosPin(userId);
  if (had) {
    await clearUserPosPin(userId);
  }
  const targetEmail = await memberEmailForAudit(userId);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.posPinAdminClear,
    metadata: { targetUserId: userId, email: targetEmail, role: existing.role },
  });
  sendJson(res, 200, { configured: false });
}

/**
 * New invitees inherit the org's business time zone when set (person profiles no longer store a zone).
 * @param {string} orgId
 * @param {string} _inviterUserId
 */
async function inviteDefaultTimezone(orgId, _inviterUserId) {
  try {
    return (await resolveBusinessTimezone(orgId)) || null;
  } catch {
    return null;
  }
}
