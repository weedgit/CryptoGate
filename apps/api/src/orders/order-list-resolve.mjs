import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import {
  isMerchantOrgType,
  paymentOrderListScope,
} from "../orgs/role-policy.mjs";
import { assertListOrdersBounds } from "./order-list-query.mjs";
import {
  expandPaymentOrderReadFilter,
  orgIdInPaymentOrderFilter,
} from "./order-list-scope.mjs";

/**
 * @param {string} agentOrgId
 * @param {object[]} visible
 */
async function merchantOrgIdsInAgentSubtree(agentOrgId, visible) {
  const org = await findOrgById(agentOrgId);
  if (!org || org.type !== "agent") {
    return { ok: false, status: 400, code: "invalid_request", message: "agentOrgId must be an agent org" };
  }
  if (!isVisibleOrg(visible, agentOrgId)) {
    return { ok: false, status: 403, code: "forbidden", message: "Outside merchant scope" };
  }
  const subtree = await listOrgsInSubtree([agentOrgId]);
  const merchantOrgIds = subtree
    .filter((row) => isMerchantOrgType(row.type))
    .map((row) => row.id);
  return { ok: true, merchantOrgIds };
}

/**
 * @param {string} orgId
 * @param {object[]} visible
 * @param {{ kind: string, treeOrgIds?: string[], cashierOrgIds?: string[], createdBy?: string | null }} filter
 */
async function merchantOrgIdsForSubtree(orgId, visible, filter) {
  if (!isVisibleOrg(visible, orgId) || !orgIdInPaymentOrderFilter(filter, orgId)) {
    return { ok: false, status: 403, code: "forbidden", message: "Outside merchant scope" };
  }
  const root = await findOrgById(orgId);
  if (!root || !isMerchantOrgType(root.type)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "includeSubtree orgId must be a merchant or merchant_site",
    };
  }
  const subtree = await listOrgsInSubtree([orgId]);
  const merchantOrgIds = subtree
    .filter((row) => isMerchantOrgType(row.type))
    .filter((row) => orgIdInPaymentOrderFilter(filter, row.id))
    .map((row) => row.id);
  return { ok: true, merchantOrgIds };
}

/**
 * Shared filter fields from parseListOrdersQuery onto a listPaymentOrders query.
 * @param {object} parsed
 * @param {Record<string, unknown>} extra
 */
export function listQueryFromParsed(parsed, extra = {}) {
  return {
    ...extra,
    status: parsed.status,
    statuses: parsed.statuses,
    creatorUserId: parsed.createdBy,
    createdFrom: parsed.createdFrom,
    createdTo: parsed.createdTo,
    q: parsed.q,
    asset: parsed.asset,
    network: parsed.network,
    limit: parsed.limit,
    offset: parsed.offset,
  };
}

/**
 * Resolve caller + parsed list query into a concrete listPaymentOrders query
 * (without forcing limit/offset — caller may override).
 * @param {{
 *   userId: string,
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {object} parsed — successful parseListOrdersQuery result
 * @returns {Promise<
 *   | { ok: true, query: Record<string, unknown> }
 *   | { ok: false, status: number, code: string, message: string }
 * >}
 */
export async function resolvePaymentOrderListQuery(caller, parsed) {
  const scope = paymentOrderListScope(caller);
  if (scope.kind === "none") {
    return { ok: false, status: 403, code: "forbidden", message: "Outside merchant scope" };
  }

  if (parsed.agentOrgId) {
    const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
    const resolved = await merchantOrgIdsInAgentSubtree(parsed.agentOrgId, visible);
    if (!resolved.ok) return resolved;
    if (parsed.orgId && !resolved.merchantOrgIds.includes(parsed.orgId)) {
      return { ok: false, status: 403, code: "forbidden", message: "Outside merchant scope" };
    }
    const filter = await expandPaymentOrderReadFilter(scope);
    let allowedIds =
      filter.kind === "all"
        ? resolved.merchantOrgIds
        : resolved.merchantOrgIds.filter((id) =>
            orgIdInPaymentOrderFilter(filter, id),
          );
    if (parsed.includeSubtree && parsed.orgId) {
      const subtree = await merchantOrgIdsForSubtree(parsed.orgId, visible, filter);
      if (!subtree.ok) return subtree;
      const allow = new Set(allowedIds);
      allowedIds = subtree.merchantOrgIds.filter((id) => allow.has(id));
    }
    const hasOrgScope = allowedIds.length > 0 || Boolean(parsed.orgId);
    const bounds = assertListOrdersBounds(parsed, { hasOrgScope });
    if (!bounds.ok) return bounds;
    if (allowedIds.length === 0) {
      return {
        ok: true,
        query: listQueryFromParsed(parsed, {
          kind: "filter",
          treeOrgIds: [],
          orgId: null,
        }),
      };
    }
    return {
      ok: true,
      query: listQueryFromParsed(parsed, {
        kind: "filter",
        treeOrgIds: allowedIds,
        orgId: parsed.includeSubtree || !parsed.orgId ? null : parsed.orgId,
      }),
    };
  }

  const filter = await expandPaymentOrderReadFilter(scope);
  if (parsed.orgId && !orgIdInPaymentOrderFilter(filter, parsed.orgId)) {
    return { ok: false, status: 403, code: "forbidden", message: "Outside merchant scope" };
  }

  const platformWide = filter.kind === "all" && !parsed.orgId;

  if (parsed.includeSubtree && parsed.orgId) {
    const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
    const subtree = await merchantOrgIdsForSubtree(parsed.orgId, visible, filter);
    if (!subtree.ok) return subtree;
    const bounds = assertListOrdersBounds(parsed, { hasOrgScope: true });
    if (!bounds.ok) return bounds;
    return {
      ok: true,
      query: listQueryFromParsed(parsed, {
        kind: "filter",
        treeOrgIds: subtree.merchantOrgIds,
        cashierOrgIds: [],
        createdBy: null,
        orgId: null,
      }),
    };
  }

  const bounds = assertListOrdersBounds(parsed, {
    hasOrgScope: !platformWide,
  });
  if (!bounds.ok) return bounds;

  return {
    ok: true,
    query: listQueryFromParsed(parsed, {
      kind: filter.kind === "all" ? "all" : "filter",
      treeOrgIds: filter.kind === "filter" ? filter.treeOrgIds : [],
      cashierOrgIds: filter.kind === "filter" ? filter.cashierOrgIds : [],
      createdBy: filter.kind === "filter" ? filter.createdBy : null,
      orgId: parsed.orgId,
    }),
  };
}
