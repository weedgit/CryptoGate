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
 * Memberships that may create a payment order.
 * @param {{ orgId: string, role: string, orgType: string }[]} memberships
 */
export function eligibleOrderMemberships(memberships) {
  return memberships.filter(
    (m) => MERCHANT_TYPES.has(m.orgType) && ORDER_CREATE_ROLES.has(m.role),
  );
}

/**
 * OpenAPI create body has no orgId; one merchant membership is enough.
 * Multiple merchant memberships require orgId (accepted until the spec adds it).
 * @param {{ orgId: string, role: string, orgType: string }[]} memberships
 * @param {string | null} requestedOrgId
 * @returns {{ ok: true, orgId: string } | { ok: false, status: number, code: string, message: string }}
 */
export function resolveOrderOrgId(memberships, requestedOrgId) {
  if (requestedOrgId) {
    if (!canCreatePaymentOrder(memberships, requestedOrgId)) {
      return {
        ok: false,
        status: 403,
        code: "forbidden",
        message: "Not allowed to create payment orders for this org",
      };
    }
    return { ok: true, orgId: requestedOrgId };
  }

  const eligible = eligibleOrderMemberships(memberships);
  if (eligible.length === 1) return { ok: true, orgId: eligible[0].orgId };
  if (eligible.length === 0) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Agent accounts cannot create payment orders",
    };
  }
  return {
    ok: false,
    status: 400,
    code: "org_required",
    message: "orgId is required when you have multiple merchant memberships",
  };
}

const ORDER_READ_ROLES = new Set(["owner", "administrator", "viewer"]);

/**
 * Merchant A cannot read Merchant B. Agents have no payment-order access.
 * Cashier may read own orders only.
 * @param {{
 *   userId: string,
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ orgId: string, createdBy: string }} order
 */
export function canReadPaymentOrder(caller, order) {
  if (caller.platformOperator) return true;
  const m = caller.memberships.find((row) => row.orgId === order.orgId);
  if (!m || !MERCHANT_TYPES.has(m.orgType)) return false;
  if (m.role === "cashier") return order.createdBy === caller.userId;
  return ORDER_READ_ROLES.has(m.role);
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

/**
 * Cashier cannot view settlement. Agent subtree and merchant Viewer may read.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string }[],
 * }} caller
 * @param {{ id: string, type: string }} org
 */
export function canViewSettlementSettings(caller, org) {
  if (!MERCHANT_TYPES.has(org.type)) return false;
  if (caller.platformOperator) return true;
  const role = roleOnOrg(caller.memberships, org.id);
  if (role === "cashier") return false;
  if (role) return true;
  // Visible via ancestor (agent or parent merchant). Pure Cashiers must not
  // read settlement on descendant sites either.
  return caller.memberships.some((m) => m.role !== "cashier");
}

/** Same bar as settlement: Cashier cannot change matching mode. */
export function canChangeMatchingModeSettings(caller, org) {
  return canChangeSettlementSettings(caller, org);
}

/** Same bar as settlement: Cashier cannot view matching mode. */
export function canViewMatchingModeSettings(caller, org) {
  return canViewSettlementSettings(caller, org);
}

/** Same bar as settlement: Cashier cannot change xPub. */
export function canChangeXpubSettings(caller, org) {
  return canChangeSettlementSettings(caller, org);
}

/** Same bar as settlement: Cashier cannot view xPub settings. */
export function canViewXpubSettings(caller, org) {
  return canViewSettlementSettings(caller, org);
}
