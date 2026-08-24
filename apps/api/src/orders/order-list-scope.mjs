import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { isMerchantOrgType } from "../orgs/role-policy.mjs";

/**
 * @param {{ kind: "all" } | { kind: "none" } | {
 *   kind: "scoped",
 *   treeRoots: string[],
 *   cashierOrgIds: string[],
 *   userId: string,
 * }} scope
 * @returns {Promise<{ kind: "all" } | { kind: "none" } | {
 *   kind: "filter",
 *   treeOrgIds: string[],
 *   cashierOrgIds: string[],
 *   createdBy: string,
 * }>}
 */
export async function expandPaymentOrderReadFilter(scope) {
  if (scope.kind === "all") return { kind: "all" };
  if (scope.kind === "none") return { kind: "none" };

  /** @type {string[]} */
  let treeOrgIds = [];
  if (scope.treeRoots.length > 0) {
    const rows = await listOrgsInSubtree(scope.treeRoots);
    treeOrgIds = rows.filter((row) => isMerchantOrgType(row.type)).map((row) => row.id);
  }

  return {
    kind: "filter",
    treeOrgIds,
    cashierOrgIds: scope.cashierOrgIds,
    createdBy: scope.userId,
  };
}

/**
 * @param {{ kind: "all" } | { kind: "none" } | {
 *   kind: "filter",
 *   treeOrgIds: string[],
 *   cashierOrgIds: string[],
 * }} filter
 * @param {string} orgId
 */
export function orgIdInPaymentOrderFilter(filter, orgId) {
  if (filter.kind === "all") return true;
  if (filter.kind === "none") return false;
  return filter.treeOrgIds.includes(orgId) || filter.cashierOrgIds.includes(orgId);
}
