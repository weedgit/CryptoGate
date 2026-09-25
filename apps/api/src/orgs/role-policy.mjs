import { canManageOrgTree, isPlatformStaff } from "./membership-rules.mjs";
import { roleOnOrg } from "./org-access.mjs";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const MFA_ROLES = new Set(["owner", "administrator"]);
const ORDER_CREATE_ROLES = new Set(["owner", "administrator", "cashier"]);
const SETTINGS_ROLES = new Set(["owner", "administrator"]);

/**
 * Owner/Admin on the org itself, or platform operator — edit name / brand icon.
 * @param {{ platformOperator: boolean, memberships: { orgId: string, role: string }[] }} caller
 * @param {{ id: string, type: string }} org
 */
export function canEditOrgProfile(caller, org) {
  if (org.type === "platform") return false;
  if (canManagePlatform(caller)) return true;
  const role = roleOnOrg(caller.memberships, org.id);
  return SETTINGS_ROLES.has(role);
}

/**
 * Platform staff (O/A/V) may read platform-wide lists; operators may write.
 * @param {{ platformOperator: boolean, memberships: { orgType: string, role: string }[] }} caller
 */
function platformHasGlobalRead(caller) {
  return caller.platformOperator === true || isPlatformStaff(caller.memberships);
}

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
 * Platform Owner / Administrator — onboard, maintenance, org lifecycle. Not Viewer.
 * @param {{ platformOperator: boolean }} caller
 */
export function canManagePlatform(caller) {
  return caller.platformOperator === true;
}

/**
 * @param {{ platformOperator: boolean }} caller
 * @param {string | null} parentRole
 */
export function canCreateOrgUnderParent(caller, parentRole) {
  return canManagePlatform(caller) || canManageOrgTree(parentRole);
}

/**
 * Parent merchant Owner/Admin may delete an empty merchant site org.
 * Platform operators use the general org delete path.
 * Immediate-parent check only — prefer `canManageMerchantSiteTree` for nested sites.
 * @param {{ platformOperator: boolean, memberships: { orgId: string, role: string }[] }} caller
 * @param {{ type: string, parent_id?: string | null }} siteOrg
 */
export function canDeleteMerchantSite(caller, siteOrg) {
  if (siteOrg.type !== "merchant_site") return false;
  if (caller.platformOperator) return true;
  const parentId = siteOrg.parent_id ?? null;
  if (!parentId) return false;
  const parentRole = roleOnOrg(caller.memberships, parentId);
  return canManageOrgTree(parentRole);
}

/**
 * Platform operator, or Owner/Admin on any ancestor merchant/site in the chain.
 * @param {{ platformOperator: boolean, memberships: { orgId: string, role: string }[] }} caller
 * @param {{ type: string, parent_id?: string | null, parentId?: string | null }} siteOrg
 * @param {(id: string) => Promise<object | null> | object | null} [getById]
 */
export async function canManageMerchantSiteTree(
  caller,
  siteOrg,
  getById = findOrgByIdLazy,
) {
  if (siteOrg.type !== "merchant_site") return false;
  if (caller.platformOperator) return true;
  let currentId = siteOrg.parent_id ?? siteOrg.parentId ?? null;
  const seen = new Set();
  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const role = roleOnOrg(caller.memberships, currentId);
    if (canManageOrgTree(role)) return true;
    const row = await getById(currentId);
    if (!row) break;
    if (row.type !== "merchant" && row.type !== "merchant_site") break;
    currentId = row.parent_id ?? row.parentId ?? null;
  }
  return false;
}

/** Lazy import to avoid circular deps at module load. */
async function findOrgByIdLazy(id) {
  const { findOrgById } = await import("./org-store.mjs");
  return findOrgById(id);
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

export function isMerchantOrgType(type) {
  return MERCHANT_TYPES.has(type);
}

/**
 * Merchant A cannot read Merchant B via direct membership alone.
 * Cashier may read own orders only. Platform staff have global read.
 * Agent subtree list/detail uses paymentOrderListScope helpers (watch-only).
 * @param {{
 *   userId: string,
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ orgId: string, createdBy: string }} order
 */
export function canReadPaymentOrder(caller, order) {
  if (platformHasGlobalRead(caller)) return true;
  const m = caller.memberships.find((row) => row.orgId === order.orgId);
  if (!m || !MERCHANT_TYPES.has(m.orgType)) return false;
  if (m.role === "cashier") return order.createdBy === caller.userId;
  return ORDER_READ_ROLES.has(m.role);
}

/**
 * Cancel pending payment orders. Owner/Admin: any order on their merchant org.
 * Cashier: own orders only. Viewer: never. Not verifying/completed (may have chain tx).
 * @param {{
 *   userId: string,
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ orgId: string, createdBy: string, status: string }} order
 */
export function canCancelPaymentOrder(caller, order) {
  if (order.status !== "pending_payment") return false;
  if (caller.platformOperator === true) return true;
  const m = caller.memberships.find((row) => row.orgId === order.orgId);
  if (!m || !MERCHANT_TYPES.has(m.orgType)) return false;
  if (m.role === "cashier") return order.createdBy === caller.userId;
  return m.role === "owner" || m.role === "administrator";
}

/**
 * Resolve payment anomaly after manual reconcile (required note — never Mark paid).
 * Same role bar as cancel: O/A any on org; Cashier own only.
 * @param {{
 *   userId: string,
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ orgId: string, createdBy: string, status: string }} order
 */
export function canResolvePaymentAnomaly(caller, order) {
  if (order.status !== "payment_anomaly") return false;
  if (caller.platformOperator === true) return true;
  const m = caller.memberships.find((row) => row.orgId === order.orgId);
  if (!m || !MERCHANT_TYPES.has(m.orgType)) return false;
  if (m.role === "cashier") return order.createdBy === caller.userId;
  return m.role === "owner" || m.role === "administrator";
}

/**
 * List/export scope. Agent O/A/V may list payment orders under their subtree
 * (watch-only). They cannot create orders.
 * @param {{
 *   userId: string,
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @returns {{ kind: "all" } | { kind: "none" } | {
 *   kind: "scoped",
 *   treeRoots: string[],
 *   cashierOrgIds: string[],
 *   userId: string,
 * }}
 */
export function paymentOrderListScope(caller) {
  if (platformHasGlobalRead(caller)) return { kind: "all" };
  /** @type {string[]} */
  const treeRoots = [];
  /** @type {string[]} */
  const cashierOrgIds = [];
  for (const m of caller.memberships) {
    if (MERCHANT_TYPES.has(m.orgType)) {
      if (ORDER_READ_ROLES.has(m.role)) treeRoots.push(m.orgId);
      else if (m.role === "cashier") cashierOrgIds.push(m.orgId);
      continue;
    }
    // Agent O/A/V: read payment orders for merchants in their subtree (watch-only).
    if (m.orgType === "agent" && ORDER_READ_ROLES.has(m.role)) {
      treeRoots.push(m.orgId);
    }
  }
  if (treeRoots.length === 0 && cashierOrgIds.length === 0) {
    return { kind: "none" };
  }
  return {
    kind: "scoped",
    treeRoots,
    cashierOrgIds,
    userId: caller.userId,
  };
}

/**
 * CSV export is Owner / Administrator / Viewer (and platform operators). Not Cashier.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgType: string, role: string }[],
 * }} caller
 */
export function canExportPaymentOrders(caller) {
  if (platformHasGlobalRead(caller)) return true;
  return caller.memberships.some(
    (m) =>
      ORDER_READ_ROLES.has(m.role) &&
      (MERCHANT_TYPES.has(m.orgType) || m.orgType === "agent"),
  );
}

/**
 * Platform Owner or Administrator may apply B7 compliance overrides (logged + MFA).
 * @param {{ platformOperator: boolean }} caller
 */
export function canComplianceOverride(caller) {
  return caller.platformOperator === true;
}

/**
 * Cashier cannot change settlement address, xPub, matching mode, or fees.
 * Agent memberships are not enough — caller must be Owner/Admin on that merchant org
 * (or platform Owner for direct settlement put; Administrators use compliance override).
 * @param {{ platformOwner: boolean, memberships: { orgId: string, role: string }[] }} caller
 * @param {{ id: string, type: string }} org
 */
export function canChangeSettlementSettings(caller, org) {
  if (!MERCHANT_TYPES.has(org.type)) return false;
  // Platform Owner or Administrator may support-edit settlement.
  if (caller.platformOperator === true) return true;
  // Merchant Owner only (not Administrator) — Business-Model decision 19.
  const role = roleOnOrg(caller.memberships, org.id);
  return role === "owner";
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
  if (platformHasGlobalRead(caller)) return true;
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

/**
 * Site Owner / Administrator may request an override; Cashier cannot.
 * @param {{ memberships: { orgId: string, role: string }[] }} caller
 * @param {{ id: string, type: string }} org
 */
export function canRequestSiteOverride(caller, org) {
  if (org.type !== "merchant_site") return false;
  const role = roleOnOrg(caller.memberships, org.id);
  return SETTINGS_ROLES.has(role);
}

/**
 * Parent merchant Owner decides. Not site Owner, not parent Administrator, not platform B7.
 * @param {{ memberships: { orgId: string, role: string }[] }} caller
 * @param {{ id: string, type: string, parent_id?: string | null, parentId?: string | null }} org
 */
export function canDecideSiteOverride(caller, org) {
  if (org.type !== "merchant_site") return false;
  const parentId = org.parent_id ?? org.parentId ?? null;
  if (!parentId) return false;
  return roleOnOrg(caller.memberships, parentId) === "owner";
}

/** Same visibility as settlement GET (site team, parent, agent subtree). */
export function canViewSiteOverrides(caller, org) {
  return canViewSettlementSettings(caller, org);
}

/** Same bar as settlement: Cashier cannot view matching mode. */
export function canViewMatchingModeSettings(caller, org) {
  return canViewSettlementSettings(caller, org);
}

/** Same bar as matching mode: Cashier cannot change fulfillment policy. */
export function canChangeFulfillmentPolicySettings(caller, org) {
  return canChangeSettlementSettings(caller, org);
}

/** Same bar as matching mode: Cashier cannot view fulfillment policy settings. */
export function canViewFulfillmentPolicySettings(caller, org) {
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

/**
 * Webhooks: Owner/Admin on merchant (or platform owner). Cashier and agent 403.
 * @param {{ platformOwner: boolean, memberships: { orgId: string, role: string, orgType: string }[] }} caller
 * @param {{ id: string, type: string }} org
 */
export function canManageWebhooks(caller, org) {
  return canChangeSettlementSettings(caller, org);
}

/**
 * List/test visibility: same as xPub GET (Owner/Admin/Viewer; Cashier 403).
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string }[],
 * }} caller
 * @param {{ id: string, type: string }} org
 */
export function canViewWebhooks(caller, org) {
  return canViewXpubSettings(caller, org);
}

/**
 * Resolve merchant org for /v1/webhooks (no orgId in path).
 * @param {{ orgId: string, role: string, orgType: string }[]} memberships
 * @param {string | null} requestedOrgId
 * @param {"view" | "manage"} mode
 */
export function resolveWebhookOrgId(memberships, requestedOrgId, mode) {
  return resolveMerchantSettingsOrgId(memberships, requestedOrgId, mode, {
    manageForbidden: "Not allowed to manage webhooks for this org",
    agentForbidden: "Agent accounts cannot register merchant webhooks",
    emptyForbidden: "Not allowed to manage webhooks",
  });
}

/**
 * Same role bar as webhooks (Owner/Admin manage; Viewer list; Cashier/agent 403).
 * @param {{ orgId: string, role: string, orgType: string }[]} memberships
 * @param {string | null} requestedOrgId
 * @param {"view" | "manage"} mode
 */
export function resolveApiKeyOrgId(memberships, requestedOrgId, mode) {
  return resolveMerchantSettingsOrgId(memberships, requestedOrgId, mode, {
    manageForbidden: "Not allowed to manage API keys for this org",
    agentForbidden: "Agent accounts cannot manage merchant API keys",
    emptyForbidden: "Not allowed to manage API keys",
  });
}

/**
 * @param {{ orgId: string, role: string, orgType: string }[]} memberships
 * @param {string | null} requestedOrgId
 * @param {"view" | "manage"} mode
 * @param {{ manageForbidden: string, agentForbidden: string, emptyForbidden: string }} messages
 */
function resolveMerchantSettingsOrgId(
  memberships,
  requestedOrgId,
  mode,
  messages,
) {
  const roleSet = mode === "manage" ? SETTINGS_ROLES : ORDER_READ_ROLES;
  const eligible = memberships.filter(
    (m) => MERCHANT_TYPES.has(m.orgType) && roleSet.has(m.role),
  );
  if (requestedOrgId) {
    const m = eligible.find((row) => row.orgId === requestedOrgId);
    if (!m) {
      return {
        ok: false,
        status: 403,
        code: "forbidden",
        message: messages.manageForbidden,
      };
    }
    return { ok: true, orgId: m.orgId };
  }
  if (eligible.length === 1) return { ok: true, orgId: eligible[0].orgId };
  if (eligible.length === 0) {
    const agentOnly = memberships.some((m) => m.orgType === "agent");
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: agentOnly ? messages.agentForbidden : messages.emptyForbidden,
    };
  }
  return {
    ok: false,
    status: 400,
    code: "org_required",
    message: "orgId is required when you have multiple merchant memberships",
  };
}

/** Same bar as webhooks: Cashier cannot manage API keys. */
export function canManageApiKeys(caller, org) {
  return canManageWebhooks(caller, org);
}

/** Same bar as webhooks GET: Owner/Admin/Viewer; Cashier 403. */
export function canViewApiKeys(caller, org) {
  return canViewWebhooks(caller, org);
}

/**
 * Platform Owner/Admin may issue service bills (never Cashiers).
 * @param {{ platformOperator: boolean }} caller
 */
export function canIssueServiceBill(caller) {
  return caller.platformOperator === true;
}

/**
 * Month backfill / generate batch — Platform Owner only (ops override).
 * @param {{ platformOwner?: boolean }} caller
 */
export function canGenerateServiceBills(caller) {
  return caller.platformOwner === true;
}

/**
 * Platform Owner/Admin may PATCH service bills (mark paid / void / adjust).
 * @param {{ platformOperator: boolean }} caller
 */
export function canUpdateServiceBill(caller) {
  return caller.platformOperator === true;
}

/**
 * Audit log list scope. Cashier none; platform staff all; agent/merchant O/A/V subtree.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @returns {{ kind: "all" } | { kind: "none" } | { kind: "scoped", rootIds: string[] }}
 */
export function auditListScope(caller) {
  if (platformHasGlobalRead(caller)) return { kind: "all" };
  /** @type {string[]} */
  const rootIds = [];
  for (const m of caller.memberships) {
    if (m.role === "cashier") continue;
    if (!ORDER_READ_ROLES.has(m.role)) continue;
    if (m.orgType === "platform") continue;
    rootIds.push(m.orgId);
  }
  if (rootIds.length === 0) return { kind: "none" };
  return { kind: "scoped", rootIds };
}

/**
 * Merchant Owner/Admin may open checkout for their org. Not Viewer/Cashier/agent.
 * @param {{ platformOwner: boolean, memberships: { orgId: string, role: string }[] }} caller
 * @param {{ id: string, type: string }} org
 */
export function canCheckoutServiceBill(caller, org) {
  if (caller.platformOwner) return true;
  if (!MERCHANT_TYPES.has(org.type)) return false;
  const role = roleOnOrg(caller.memberships, org.id);
  return SETTINGS_ROLES.has(role);
}

/**
 * List/read scope for service bills. Cashiers have none. Agents: subtree.
 * Merchants: own O/A/V orgs. Platform: all.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @returns {{ kind: "all" } | { kind: "none" } | { kind: "scoped", rootIds: string[] }}
 */
export function serviceBillListScope(caller) {
  if (platformHasGlobalRead(caller)) return { kind: "all" };
  /** @type {string[]} */
  const rootIds = [];
  for (const m of caller.memberships) {
    if (m.role === "cashier") continue;
    if (MERCHANT_TYPES.has(m.orgType) && ORDER_READ_ROLES.has(m.role)) {
      rootIds.push(m.orgId);
      continue;
    }
    if (m.orgType === "agent" && ORDER_READ_ROLES.has(m.role)) {
      rootIds.push(m.orgId);
    }
  }
  if (rootIds.length === 0) return { kind: "none" };
  return { kind: "scoped", rootIds };
}

/**
 * Whether caller may read a bill for this merchant org.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ id: string, type: string }} org
 * @param {Set<string>} [visibleOrgIds]
 */
export function canViewServiceBill(caller, org, visibleOrgIds) {
  if (!MERCHANT_TYPES.has(org.type)) return false;
  if (platformHasGlobalRead(caller)) return true;
  if (visibleOrgIds) return visibleOrgIds.has(org.id);
  const role = roleOnOrg(caller.memberships, org.id);
  if (role === "cashier") return false;
  if (role && ORDER_READ_ROLES.has(role)) return true;
  return false;
}

/** Platform Owner only — fee tiers, org policy, enterprise approve/deny. */
export function canUpdatePlatformOwnerSettings(caller) {
  return caller.platformOwner === true;
}

/**
 * Global tier bands: platform / agent / merchant O·A·V. Cashier 403.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgType: string, role: string }[],
 * }} caller
 */
export function canReadFeeTierBands(caller) {
  if (platformHasGlobalRead(caller)) return true;
  return caller.memberships.some(
    (m) =>
      m.role !== "cashier" &&
      ORDER_READ_ROLES.has(m.role) &&
      (MERCHANT_TYPES.has(m.orgType) || m.orgType === "agent"),
  );
}

/** Platform O·A·V only (OpenAPI v0.3.3). */
export function canReadPlatformOrgPolicy(caller) {
  return caller.memberships.some(
    (m) => m.orgType === "platform" && ORDER_READ_ROLES.has(m.role),
  );
}

/** Bulk member emails for list search and invite validation (one query vs N× listOrgUsers). */
export function canListOrgMemberEmailsBulk(caller) {
  if (platformHasGlobalRead(caller)) return true;
  return caller.memberships.some(
    (m) =>
      (m.role === "owner" || m.role === "administrator") &&
      m.status !== "paused",
  );
}

/** @deprecated Use canListOrgMemberEmailsBulk */
export function canListPlatformOrgMemberEmails(caller) {
  return canListOrgMemberEmailsBulk(caller);
}

export function canListEnterpriseApprovals(caller) {
  return caller.memberships.some(
    (m) => m.orgType === "platform" && ORDER_READ_ROLES.has(m.role),
  );
}

/**
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ id: string, type: string }} org
 */
export function canReadMerchantCommercial(caller, org) {
  if (!MERCHANT_TYPES.has(org.type)) return false;
  if (platformHasGlobalRead(caller)) return true;
  const role = roleOnOrg(caller.memberships, org.id);
  if (role === "cashier") return false;
  if (role && ORDER_READ_ROLES.has(role)) return true;
  return caller.memberships.some(
    (m) => m.orgType === "agent" && ORDER_READ_ROLES.has(m.role),
  );
}

/**
 * Platform may update merchant commercial settings.
 * Fixed specials require Platform Owner; Automatic / billing flags allow Owner or Admin.
 * @param {{
 *   platformOperator: boolean,
 *   platformOwner?: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ id: string, type: string, parent_id?: string | null, parentId?: string | null }} org
 * @param {string[]} [_ancestorIds]
 * @param {{ rateMode?: "automatic" | "fixed" }} [opts]
 */
export function canUpdateMerchantCommercial(caller, org, _ancestorIds = [], opts = {}) {
  if (!MERCHANT_TYPES.has(org.type)) return false;
  if (opts.rateMode === "fixed") {
    return caller.platformOwner === true;
  }
  // Platform only — merchants/agents have no fee settings UI (decision 2).
  return caller.platformOperator === true;
}

const AGENT_ORG_TYPES = new Set(["agent"]);

/**
 * Agent Owner/Admin may create a merchant_site under a merchant in their channel
 * (parent merchant's parent is an agent they manage), without merchant membership.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ id: string, type: string, parent_id?: string | null, parentId?: string | null }} parentOrg
 */
export function canOnboardSiteUnderParent(caller, parentOrg) {
  if (caller.platformOperator === true) return true;
  if (parentOrg.type !== "merchant" && parentOrg.type !== "merchant_site") {
    return false;
  }
  const parentRole = roleOnOrg(caller.memberships, parentOrg.id);
  if (SETTINGS_ROLES.has(parentRole)) return true;

  if (parentOrg.type === "merchant") {
    const agentParentId = parentOrg.parent_id ?? parentOrg.parentId ?? null;
    if (!agentParentId) return false;
    const m = caller.memberships.find((x) => x.orgId === agentParentId);
    return Boolean(
      m && AGENT_ORG_TYPES.has(m.orgType) && SETTINGS_ROLES.has(m.role),
    );
  }
  return false;
}

/**
 * Async: agent may onboard site under nested site if billing merchant is in channel.
 * @param {typeof canOnboardSiteUnderParent extends Function ? never : any} caller
 * @param {object} parentOrg
 * @param {(id: string) => Promise<object | null>} findOrg
 */
export async function canOnboardSiteUnderParentAsync(caller, parentOrg, findOrg) {
  if (canOnboardSiteUnderParent(caller, parentOrg)) return true;
  if (parentOrg.type !== "merchant_site") return false;
  let current = parentOrg;
  const seen = new Set();
  while (current) {
    const id = current.id;
    if (!id || seen.has(id)) break;
    seen.add(id);
    if (current.type === "merchant") {
      return canOnboardSiteUnderParent(caller, current);
    }
    const pid = current.parent_id ?? current.parentId ?? null;
    if (!pid) break;
    current = await findOrg(pid);
  }
  return false;
}

/**
 * Whether an existing user may be invited onto a merchant/site team.
 * Verified Platform/Agent Owner/Administrator: yes. Viewers: no.
 * @param {{
 *   emailVerified?: boolean,
 *   phoneVerified?: boolean,
 * } | null} user
 * @param {{ orgType: string, role: string }[]} memberships
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function evaluateCrossOrgMerchantSiteInvite(user, memberships) {
  const staff = (memberships ?? []).filter(
    (m) =>
      (m.orgType === "platform" || m.orgType === "agent") &&
      ["owner", "administrator", "viewer"].includes(m.role),
  );
  if (staff.length === 0) return { ok: true };
  const hasOA = staff.some(
    (m) => m.role === "owner" || m.role === "administrator",
  );
  const hasViewer = staff.some((m) => m.role === "viewer");
  if (hasViewer && !hasOA) {
    return {
      ok: false,
      code: "invite_role_forbidden",
      message:
        "Platform or agent Viewer accounts cannot join a merchant or site team",
    };
  }
  if (hasOA) {
    if (!user?.emailVerified || !user?.phoneVerified) {
      return {
        ok: false,
        code: "invite_unverified",
        message:
          "Platform or agent Owner/Administrator must verify email and phone before joining a merchant or site team",
      };
    }
  }
  return { ok: true };
}

/**
 * Block using Platform/Agent O/A as the Owner email when onboarding merchant/site.
 * @param {{ orgType: string, role: string }[]} memberships
 */
export function isPlatformOrAgentOperatorMemberships(memberships) {
  return (memberships ?? []).some(
    (m) =>
      (m.orgType === "platform" || m.orgType === "agent") &&
      (m.role === "owner" || m.role === "administrator"),
  );
}

/** Agent may lifecycle-manage direct children only (not grandchildren). */
const DIRECT_CHILD_MANAGEABLE_TYPES = new Set(["merchant"]);

/**
 * Agent Owner/Admin may onboard, suspend, delete, and set commercial
 * terms for merchants whose parent is an agent channel org they manage —
 * never grandchildren relative to a top-level agent org (even with dual membership).
 * Platform operators bypass this check.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ id?: string, type: string, parent_id?: string | null, parentId?: string | null }} org
 * @param {string[]} [ancestorIds] parent chain ids (immediate parent first)
 */
export function canManageDirectChildOrg(caller, org, ancestorIds = []) {
  if (caller.platformOperator) return true;
  if (!DIRECT_CHILD_MANAGEABLE_TYPES.has(org.type)) return false;
  const parentId = org.parent_id ?? org.parentId ?? null;
  if (!parentId) return false;
  const parentMembership = caller.memberships.find((m) => m.orgId === parentId);
  if (!parentMembership) return false;
  if (!AGENT_ORG_TYPES.has(parentMembership.orgType)) return false;
  if (!SETTINGS_ROLES.has(parentMembership.role)) return false;

  if (ancestorIds.length > 0) {
    for (const m of caller.memberships) {
      if (m.orgType !== "agent" || !SETTINGS_ROLES.has(m.role)) continue;
      if (parentId === m.orgId) continue;
      if (ancestorIds.includes(m.orgId)) return false;
    }
  }

  return true;
}

/**
 * @param {string} type
 */
export function isAgentOrgType(type) {
  return AGENT_ORG_TYPES.has(type);
}

/**
 * Platform staff or agent org Owner/Admin/Viewer may read payout address.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string }[],
 * }} caller
 * @param {{ id: string, type: string }} org
 */
export function canReadAgentPayout(caller, org) {
  if (!AGENT_ORG_TYPES.has(org.type)) return false;
  if (platformHasGlobalRead(caller)) return true;
  const role = roleOnOrg(caller.memberships, org.id);
  if (role === "cashier") return false;
  if (role && ORDER_READ_ROLES.has(role)) return true;
  return false;
}

/**
 * Agent org Owner/Admin may set payout address (not platform staff).
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string }[],
 * }} caller
 * @param {{ id: string, type: string }} org
 */
export function canUpdateAgentPayout(caller, org) {
  if (!AGENT_ORG_TYPES.has(org.type)) return false;
  if (caller.platformOperator === true) return true;
  const role = roleOnOrg(caller.memberships, org.id);
  return SETTINGS_ROLES.has(role);
}

/**
 * Platform staff or agent org Owner/Admin/Viewer may read commission %.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string }[],
 * }} caller
 * @param {{ id: string, type: string }} org
 */
export function canReadAgentCommission(caller, org) {
  if (!AGENT_ORG_TYPES.has(org.type)) return false;
  if (platformHasGlobalRead(caller)) return true;
  const role = roleOnOrg(caller.memberships, org.id);
  if (role === "cashier") return false;
  if (role && ORDER_READ_ROLES.has(role)) return true;
  return false;
}

/**
 * Platform Owner/Administrator only — Edit commission rate (B3).
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ id: string, type: string }} org
 */
export function canUpdateAgentCommission(caller, org) {
  if (!AGENT_ORG_TYPES.has(org.type)) return false;
  return caller.platformOperator === true;
}

/**
 * Platform staff or agent O/A/V may list commission payout slips.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgType: string, role: string }[],
 * }} caller
 */
export function canReadCommissionPayouts(caller) {
  if (platformHasGlobalRead(caller)) return true;
  return caller.memberships.some(
    (m) =>
      AGENT_ORG_TYPES.has(m.orgType) && ORDER_READ_ROLES.has(m.role),
  );
}

/**
 * Platform-wide commission payout history.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgType: string, role: string }[],
 * }} caller
 */
export function canReadAllCommissionPayouts(caller) {
  return platformHasGlobalRead(caller);
}
