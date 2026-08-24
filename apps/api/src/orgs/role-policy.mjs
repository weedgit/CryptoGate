import { canManageOrgTree } from "./membership-rules.mjs";
import { roleOnOrg } from "./org-access.mjs";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const MFA_ROLES = new Set(["owner", "administrator"]);
const ORDER_CREATE_ROLES = new Set(["owner", "administrator", "cashier"]);
const SETTINGS_ROLES = new Set(["owner", "administrator"]);

/**
 * OpenAPI: Owner / Administrator may enroll MFA (platform, agent, or merchant).
 * @param {{ role: string }[]} memberships
 */
export function canEnrollMfa(memberships) {
  return memberships.some((m) => MFA_ROLES.has(m.role));
}

/**
 * First platform org: empty memberships, or an existing Owner/Admin.
 * @param {{ memberships: { role: string }[] }} caller
 */
export function canBootstrapPlatform(caller) {
  if (caller.memberships.length === 0) return true;
  return caller.memberships.some((m) => MFA_ROLES.has(m.role));
}

/**
 * @param {{ platformOperator: boolean }} caller
 * @param {string | null} parentRole
 */
export function canCreateOrgUnderParent(caller, parentRole) {
  return caller.platformOperator || canManageOrgTree(parentRole);
}

/**
 * Agent-account users cannot create merchant payment orders.
 * Viewer cannot create. Cashier / Owner / Admin on merchant or site can.
 * @param {{ orgId: string, role: string, orgType: string }[]} memberships
 * @param {string} merchantOrgId
 */
export function canCreatePaymentOrder(memberships, merchantOrgId) {
  const m = memberships.find((row) => row.orgId === merchantOrgId);
  if (!m || !MERCHANT_TYPES.has(m.orgType)) return false;
  return ORDER_CREATE_ROLES.has(m.role);
}

/**
 * Cashier cannot change settlement address, xPub, matching mode, or fees.
 * Agent memberships are not enough — caller must be Owner/Admin on that merchant org
 * (or platform Owner for compliance override).
 * @param {{ platformOwner: boolean, memberships: { orgId: string, role: string }[] }} caller
 * @param {{ id: string, type: string }} org
 */
export function canChangeSettlementSettings(caller, org) {
  if (caller.platformOwner) return true;
  if (!MERCHANT_TYPES.has(org.type)) return false;
  const role = roleOnOrg(caller.memberships, org.id);
  return SETTINGS_ROLES.has(role);
}
