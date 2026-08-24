export const USER_ROLES = ["owner", "administrator", "viewer", "cashier"];

const CASHIER_ORG_TYPES = new Set(["merchant", "merchant_site"]);
const MANAGE_ORG_ROLES = new Set(["owner", "administrator"]);

/**
 * @param {string} role
 * @param {string} orgType
 */
export function roleAllowedOnOrg(role, orgType) {
  if (!USER_ROLES.includes(role)) return false;
  if (role === "cashier") return CASHIER_ORG_TYPES.has(orgType);
  return true;
}

/**
 * Owner may invite and change Administrator / Viewer / Cashier.
 * @param {string | null} role
 */
export function canManageTeam(role) {
  return role === "owner";
}

/**
 * Owner or Administrator may create child orgs under this org.
 * @param {string | null} role
 */
export function canManageOrgTree(role) {
  return MANAGE_ORG_ROLES.has(role);
}

/**
 * Platform Owner/Admin sees the full tree.
 * @param {{ role: string, orgType: string }[]} memberships
 */
export function isPlatformOperator(memberships) {
  return memberships.some(
    (m) =>
      m.orgType === "platform" &&
      (m.role === "owner" || m.role === "administrator"),
  );
}

/** Platform Owner/Admin/Viewer — read-only portal access (UI spec Part B). */
export function isPlatformStaff(memberships) {
  return memberships.some(
    (m) =>
      m.orgType === "platform" &&
      (m.role === "owner" || m.role === "administrator" || m.role === "viewer"),
  );
}

/**
 * Invite: org Owner (or platform Owner) may add any allowed role.
 * Empty child org: platform Owner/Admin or parent Owner/Admin may invite the first Owner only.
 * @param {{
 *   platformOwner: boolean,
 *   platformOperator: boolean,
 *   roleOnOrg: string | null,
 *   roleOnParent: string | null,
 *   memberCount: number,
 *   invitedRole: string,
 * }} p
 */
export function canInviteToOrg(p) {
  if (p.platformOwner || canManageTeam(p.roleOnOrg)) return true;
  return (
    p.memberCount === 0 &&
    p.invitedRole === "owner" &&
    (p.platformOperator || canManageOrgTree(p.roleOnParent))
  );
}

/**
 * Role changes: org Owner or platform Owner only.
 * @param {{ platformOwner: boolean, roleOnOrg: string | null }} p
 */
export function canAssignOrgRole(p) {
  return p.platformOwner || canManageTeam(p.roleOnOrg);
}

/**
 * List members: platform staff or org Owner/Admin/Viewer. Cashier 403.
 * @param {string | null} roleOnOrg
 * @param {boolean} platformOperator
 */
export function canListOrgUsers(roleOnOrg, platformOperator) {
  if (platformOperator) return true;
  if (!roleOnOrg || roleOnOrg === "cashier") return false;
  return true;
}

/**
 * @param {{ existingRole: string, nextRole: string, ownerCount: number }} p
 */
export function isLastOwnerDemotion(p) {
  return p.existingRole === "owner" && p.nextRole !== "owner" && p.ownerCount <= 1;
}

/**
 * @param {{ orgId: string, userId: string, role: string, orgType: string }} row
 */
export function toOrgMembership(row) {
  return {
    orgId: row.orgId,
    userId: row.userId,
    role: row.role,
    orgType: row.orgType,
  };
}
