import { listMembershipsForUser } from "./membership-store.mjs";
import { isPlatformOperator, isPlatformStaff } from "./membership-rules.mjs";
import { listOrgAccounts } from "./org-store.mjs";
import { listOrgsInSubtree } from "./org-scope.mjs";

/**
 * @param {{ orgId: string, role: string, orgType: string }[]} memberships
 */
export function isPlatformOwner(memberships) {
  return memberships.some((m) => m.orgType === "platform" && m.role === "owner");
}

/**
 * @param {{ orgId: string, role: string }[]} memberships
 * @param {string} orgId
 */
export function roleOnOrg(memberships, orgId) {
  return memberships.find((m) => m.orgId === orgId)?.role ?? null;
}

/**
 * @param {string} userId
 */
export async function loadCaller(userId) {
  const memberships = await listMembershipsForUser(userId);
  return {
    memberships,
    platformOwner: isPlatformOwner(memberships),
    platformOperator: isPlatformOperator(memberships),
  };
}

/**
 * @param {boolean} platformOperator
 * @param {{ orgId: string }[]} memberships
 */
export async function listVisibleOrgs(platformOperator, memberships) {
  if (platformOperator || isPlatformStaff(memberships)) {
    return listOrgAccounts();
  }
  return listOrgsInSubtree(memberships.map((m) => m.orgId));
}

/**
 * @param {object[]} visibleRows
 * @param {string} orgId
 */
export function isVisibleOrg(visibleRows, orgId) {
  return visibleRows.some((row) => row.id === orgId);
}
