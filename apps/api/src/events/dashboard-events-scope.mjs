import { paymentOrderListScope } from "../orgs/role-policy.mjs";
import { expandPaymentOrderReadFilter } from "../orders/order-list-scope.mjs";

/**
 * Resolve which orgs this caller may see on the dashboard SSE stream.
 * @param {object} caller
 * @returns {Promise<import("./dashboard-events-hub.mjs").DashboardEventAudience>}
 */
export async function resolveDashboardEventAudience(caller) {
  const scope = paymentOrderListScope(caller);
  if (scope.kind === "all") return { kind: "all" };
  if (scope.kind === "none") return { kind: "none" };

  const filter = await expandPaymentOrderReadFilter(scope);
  if (filter.kind === "all") return { kind: "all" };
  if (filter.kind === "none") return { kind: "none" };

  const treeRootIds = new Set(scope.treeRoots ?? []);
  const orgIds = new Set([
    ...(filter.treeOrgIds ?? []),
    ...(filter.cashierOrgIds ?? []),
    ...treeRootIds,
  ]);
  if (orgIds.size === 0 && treeRootIds.size === 0) return { kind: "none" };
  return { kind: "orgs", orgIds, treeRootIds };
}
