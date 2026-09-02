import { canManageOrgTree, isPlatformStaff } from "./membership-rules.mjs";
import { roleOnOrg } from "./org-access.mjs";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const MFA_ROLES = new Set(["owner", "administrator"]);
const ORDER_CREATE_ROLES = new Set(["owner", "administrator", "cashier"]);
const SETTINGS_ROLES = new Set(["owner", "administrator"]);

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
 * @param {{ platformOperator: boolean }} caller
 * @param {string | null} parentRole
 */
export function canCreateOrgUnderParent(caller, parentRole) {
  return caller.platformOperator || canManageOrgTree(parentRole);
}

/**
 * Parent merchant Owner/Admin may delete an empty merchant (site) org.
 * Platform operators use the general org delete path.
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
    if (
      (m.orgType === "agent" || m.orgType === "agent_sub") &&
      ORDER_READ_ROLES.has(m.role)
    ) {
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
      (MERCHANT_TYPES.has(m.orgType) ||
        m.orgType === "agent" ||
        m.orgType === "agent_sub"),
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
    const agentOnly = memberships.some(
      (m) => m.orgType === "agent" || m.orgType === "agent_sub",
    );
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
  return canChangeSettlementSettings(caller, org);
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
    if (
      (m.orgType === "agent" || m.orgType === "agent_sub") &&
      ORDER_READ_ROLES.has(m.role)
    ) {
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
      (MERCHANT_TYPES.has(m.orgType) ||
        m.orgType === "agent" ||
        m.orgType === "agent_sub"),
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
    (m) =>
      (m.orgType === "agent" || m.orgType === "agent_sub") &&
      ORDER_READ_ROLES.has(m.role),
  );
}

/**
 * Agent O·A on the direct parent channel org, or Platform O·A. Merchant roles 403.
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ id: string, type: string, parent_id?: string | null, parentId?: string | null }} org
 * @param {string[]} [ancestorIds]
 */
export function canUpdateMerchantCommercial(caller, org, ancestorIds = []) {
  if (!MERCHANT_TYPES.has(org.type)) return false;
  if (caller.platformOperator) return true;
  const role = roleOnOrg(caller.memberships, org.id);
  if (role && SETTINGS_ROLES.has(role)) return false;
  return canManageDirectChildOrg(caller, org, ancestorIds);
}

const AGENT_ORG_TYPES = new Set(["agent", "agent_sub"]);

/** Agent/sub-agent may lifecycle-manage direct children only (not grandchildren). */
const DIRECT_CHILD_MANAGEABLE_TYPES = new Set(["agent", "agent_sub", "merchant"]);

/**
 * Agent or sub-agent Owner/Admin may onboard, suspend, delete, and set commercial
 * terms for orgs whose parent is an agent channel org they manage — never
 * grandchildren relative to a top-level agent org (even with dual membership).
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
  // Parent agent O/A/V may read a visible descendant’s payout (for cascade slips).
  // Route already gates org visibility via listVisibleOrgs.
  return caller.memberships.some(
    (m) =>
      AGENT_ORG_TYPES.has(m.orgType) && ORDER_READ_ROLES.has(m.role),
  );
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
  // Parent agent O/A/V may read a visible descendant’s commission rate.
  return caller.memberships.some(
    (m) =>
      AGENT_ORG_TYPES.has(m.orgType) && ORDER_READ_ROLES.has(m.role),
  );
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
 * Platform-wide commission payout history (including cascade).
 * @param {{
 *   platformOperator: boolean,
 *   memberships: { orgType: string, role: string }[],
 * }} caller
 */
export function canReadAllCommissionPayouts(caller) {
  return platformHasGlobalRead(caller);
}

/**
 * Parent agent Owner/Admin may prepare / mark agent→sub payouts.
 * @param {{ memberships: { orgId: string, role: string }[] }} caller
 * @param {string} payerOrgId
 */
export function canManageAgentCommissionPayout(caller, payerOrgId) {
  if (!payerOrgId) return false;
  const role = roleOnOrg(caller.memberships, payerOrgId);
  return SETTINGS_ROLES.has(role);
}
