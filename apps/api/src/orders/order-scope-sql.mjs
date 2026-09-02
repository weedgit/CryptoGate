/**
 * Shared SQL scope for payment-order list and summary queries.
 * @param {{ kind: "all" } | {
 *   kind: "filter",
 *   treeOrgIds?: string[],
 *   cashierOrgIds?: string[],
 *   createdBy?: string | null,
 * }} filter
 * @param {unknown[]} params
 * @param {string} [alias]
 * @returns {{ clause: string, empty: boolean }}
 */
export function appendPaymentOrderScope(filter, params, alias = "o") {
  if (filter.kind === "all") {
    return { clause: "", empty: false };
  }

  const parts = [];
  if (filter.treeOrgIds && filter.treeOrgIds.length > 0) {
    params.push(filter.treeOrgIds);
    parts.push(`${alias}.org_id = ANY($${params.length}::uuid[])`);
  }
  if (filter.cashierOrgIds && filter.cashierOrgIds.length > 0) {
    params.push(filter.cashierOrgIds);
    const orgIdx = params.length;
    params.push(filter.createdBy);
    const userIdx = params.length;
    parts.push(
      `(${alias}.org_id = ANY($${orgIdx}::uuid[]) AND ${alias}.created_by = $${userIdx})`,
    );
  }

  if (parts.length === 0) {
    return { clause: "", empty: true };
  }

  return { clause: ` AND (${parts.join(" OR ")})`, empty: false };
}
