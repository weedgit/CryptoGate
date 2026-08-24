import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireSession } from "../http/require-session.mjs";
import { findOrgById } from "./org-store.mjs";
import {
  canAssignOrgRole,
  canInviteToOrg,
  isLastOwnerDemotion,
  roleAllowedOnOrg,
  toOrgMembership,
  USER_ROLES,
} from "./membership-rules.mjs";
import {
  countOrgMemberships,
  countOwners,
  findMembership,
  findOrCreateUserByEmail,
  insertMembership,
  updateMembershipRole,
} from "./membership-store.mjs";
import { isVisibleOrg, listVisibleOrgs, loadCaller, roleOnOrg } from "./org-access.mjs";

/**
 * POST /v1/orgs/{orgId}/users
 */
export async function handleInviteOrgUser(req, res, orgId) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  const org = await findOrgById(orgId);
  if (!org) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  const caller = await loadCaller(auth.userId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!caller.platformOperator && !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const email = typeof body?.email === "string" ? body.email : "";
  const role = typeof body?.role === "string" ? body.role : "";
  if (!email || !role) {
    sendError(res, 400, "invalid_request", "Email and role are required");
    return;
  }
  if (!USER_ROLES.includes(role)) {
    sendError(res, 400, "invalid_role", "Unknown role");
    return;
  }
  if (!roleAllowedOnOrg(role, org.type)) {
    sendError(res, 400, "invalid_role", "Cashier is only valid on merchant orgs");
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

  let user;
  try {
    user = await findOrCreateUserByEmail(email);
  } catch (err) {
    if (err && err.code === "email_invalid") {
      sendError(res, 400, "email_invalid", err.message);
      return;
    }
    throw err;
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

  sendJson(
    res,
    201,
    toOrgMembership({
      orgId,
      userId: user.id,
      role,
      orgType: org.type,
    }),
  );
}

/**
 * PUT /v1/orgs/{orgId}/users/{userId}/role
 */
export async function handleAssignOrgUserRole(req, res, orgId, userId) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  const org = await findOrgById(orgId);
  if (!org) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  const caller = await loadCaller(auth.userId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!caller.platformOperator && !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

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

  const existing = await findMembership(orgId, userId);
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
  sendJson(
    res,
    200,
    toOrgMembership({
      orgId,
      userId,
      role,
      orgType: org.type,
    }),
  );
}
