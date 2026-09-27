import { getPool } from "../db/pool.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { isMerchantOrgType, paymentOrderListScope } from "../orgs/role-policy.mjs";
import { expandPaymentOrderReadFilter } from "../orders/order-list-scope.mjs";

/**
 * @typedef {{ id: string, type: string, parent_id: string | null, status: string | null, created_at: Date | string }} ScopeOrgRow
 *
 * @typedef {{
 *   kind: "platform" | "agent" | "merchant",
 *   cacheKey: string,
 *   orderFilter: { kind: "all" } | { kind: "filter", treeOrgIds: string[], cashierOrgIds: string[], createdBy: string | null },
 *   billOrgIds: string[] | null,
 *   orgs: ScopeOrgRow[],
 *   commission: { payeeOrgId: string | null } | null,
 *   rootOrgId: string | null,
 * }} DashboardScope
 */

async function listAllScopeOrgs() {
  const { rows } = await getPool().query(
    `SELECT id, type, parent_id, status, created_at
     FROM org_accounts
     WHERE type IN ('agent', 'merchant', 'merchant_site')`,
  );
  return rows;
}

async function findOrgRow(orgId) {
  const { rows } = await getPool().query(
    `SELECT id, type, parent_id, status, created_at FROM org_accounts WHERE id = $1::uuid`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} value
 */
export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Resolve what a caller may aggregate on the dashboard.
 * `orgId` narrows to one agent / merchant subtree (must be visible to the caller).
 * @param {{ userId: string, memberships: { orgId: string, orgType: string, role: string }[], platformOperator?: boolean }} caller
 * @param {string | null} orgId
 * @returns {Promise<{ ok: true, scope: DashboardScope } | { ok: false, status: number, code: string, message: string }>}
 */
export async function resolveDashboardScope(caller, orgId) {
  if (orgId && !isUuid(orgId)) {
    return { ok: false, status: 400, code: "invalid_request", message: "orgId must be a UUID" };
  }
  const orderScope = paymentOrderListScope(caller);
  if (orderScope.kind === "none") {
    return { ok: false, status: 403, code: "forbidden", message: "Dashboard not available for this role" };
  }
  const global = orderScope.kind === "all";

  if (!orgId) {
    if (global) {
      return {
        ok: true,
        scope: {
          kind: "platform",
          cacheKey: "global",
          orderFilter: { kind: "all" },
          billOrgIds: null,
          orgs: await listAllScopeOrgs(),
          commission: { payeeOrgId: null },
          rootOrgId: null,
        },
      };
    }
    const filter = await expandPaymentOrderReadFilter(orderScope);
    if (filter.kind !== "filter") {
      return { ok: false, status: 403, code: "forbidden", message: "Dashboard not available for this role" };
    }
    const orgs = orderScope.treeRoots.length ? await listOrgsInSubtree(orderScope.treeRoots) : [];
    const agentRoot = caller.memberships.find(
      (m) => m.orgType === "agent" && ["owner", "administrator", "viewer"].includes(m.role),
    );
    return {
      ok: true,
      scope: {
        kind: agentRoot ? "agent" : "merchant",
        cacheKey: `u:${caller.userId}`,
        orderFilter: filter,
        billOrgIds: filter.treeOrgIds,
        orgs,
        commission: agentRoot ? { payeeOrgId: agentRoot.orgId } : null,
        rootOrgId: agentRoot?.orgId ?? orderScope.treeRoots[0] ?? null,
      },
    };
  }

  const org = await findOrgRow(orgId);
  if (!org || !["agent", "merchant", "merchant_site"].includes(org.type)) {
    return { ok: false, status: 404, code: "not_found", message: "Organization not found" };
  }
  const subtree = await listOrgsInSubtree([orgId]);
  const subtreeMerchantIds = subtree.filter((r) => isMerchantOrgType(r.type)).map((r) => r.id);
  const kind = org.type === "agent" ? "agent" : "merchant";

  if (global) {
    return {
      ok: true,
      scope: {
        kind,
        cacheKey: `global:${orgId}`,
        orderFilter: { kind: "filter", treeOrgIds: subtreeMerchantIds, cashierOrgIds: [], createdBy: null },
        billOrgIds: subtreeMerchantIds,
        orgs: subtree,
        commission: kind === "agent" ? { payeeOrgId: orgId } : null,
        rootOrgId: orgId,
      },
    };
  }

  const filter = await expandPaymentOrderReadFilter(orderScope);
  if (filter.kind !== "filter") {
    return { ok: false, status: 403, code: "forbidden", message: "Outside dashboard scope" };
  }
  const inSubtree = new Set(subtree.map((r) => r.id));
  const treeOrgIds = filter.treeOrgIds.filter((id) => inSubtree.has(id));
  const cashierOrgIds = filter.cashierOrgIds.filter((id) => inSubtree.has(id));
  const visibleRoots = orderScope.treeRoots.length ? await listOrgsInSubtree(orderScope.treeRoots) : [];
  const orgVisible =
    visibleRoots.some((r) => r.id === orgId) || filter.cashierOrgIds.includes(orgId);
  if (!orgVisible) {
    return { ok: false, status: 403, code: "forbidden", message: "Outside dashboard scope" };
  }
  const agentMember = caller.memberships.some(
    (m) =>
      m.orgId === orgId &&
      m.orgType === "agent" &&
      ["owner", "administrator", "viewer"].includes(m.role),
  );
  return {
    ok: true,
    scope: {
      kind,
      cacheKey: `u:${caller.userId}:${orgId}`,
      orderFilter: { kind: "filter", treeOrgIds, cashierOrgIds, createdBy: filter.createdBy },
      billOrgIds: treeOrgIds,
      orgs: treeOrgIds.length ? subtree : [],
      commission: agentMember ? { payeeOrgId: orgId } : null,
      rootOrgId: orgId,
    },
  };
}

/**
 * Children map for subtree walks.
 * @param {ScopeOrgRow[]} orgs
 */
export function childrenMap(orgs) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const o of orgs) {
    if (!o.parent_id) continue;
    const list = map.get(o.parent_id) ?? [];
    list.push(o.id);
    map.set(o.parent_id, list);
  }
  return map;
}

/**
 * @param {string} rootId
 * @param {Map<string, string[]>} children
 */
export function subtreeOf(rootId, children) {
  const out = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    for (const child of children.get(id) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}
