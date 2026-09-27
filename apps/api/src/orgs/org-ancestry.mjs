import { findOrgById } from "./org-store.mjs";

/**
 * Parent chain from `org.parent_id` upward (immediate parent first).
 * @param {{ parent_id?: string | null, parentId?: string | null }} org
 */
export async function collectAncestorOrgIds(org) {
  const ids = [];
  let currentId = org.parent_id ?? org.parentId ?? null;
  while (currentId) {
    ids.push(currentId);
    const row = await findOrgById(currentId);
    currentId = row?.parent_id ?? null;
  }
  return ids;
}

/**
 * Walk site → … → merchant. Sites never hold wallets; settlement always
 * resolves to this billing merchant. Returns null if the chain is broken.
 *
 * @param {{ id?: string, type?: string, parent_id?: string | null, parentId?: string | null }} org
 * @param {(id: string) => Promise<object | null> | object | null} [getById]
 * @returns {Promise<object | null>}
 */
export async function findBillingMerchantOrg(org, getById = findOrgById) {
  if (!org) return null;
  if (org.type === "merchant") return org;
  if (org.type !== "merchant_site") return null;

  let currentId = org.parent_id ?? org.parentId ?? null;
  const seen = new Set(org.id ? [org.id] : []);
  while (currentId) {
    if (seen.has(currentId)) return null;
    seen.add(currentId);
    const row = await getById(currentId);
    if (!row) return null;
    if (row.type === "merchant") return row;
    if (row.type !== "merchant_site") return null;
    currentId = row.parent_id ?? row.parentId ?? null;
  }
  return null;
}

/**
 * Suspend cascade: org is paused, or an ancestor merchant is paused.
 * Sites under a suspended merchant are watch-only without flipping each row.
 * @param {{ id?: string, type?: string, status?: string, parent_id?: string | null, parentId?: string | null, status_reason?: string | null }} org
 * @returns {Promise<{ blocked: boolean, reason: string | null, pausedOrgId: string | null }>}
 */
export async function resolveOrgSuspendBlock(org) {
  if (!org) {
    return { blocked: false, reason: null, pausedOrgId: null };
  }
  if (org.status === "paused") {
    return {
      blocked: true,
      reason: org.status_reason ? String(org.status_reason) : "Account is suspended",
      pausedOrgId: org.id ?? null,
    };
  }
  if (org.type === "merchant_site") {
    const ancestors = await collectAncestorOrgIds(org);
    for (const ancestorId of ancestors) {
      const row = await findOrgById(ancestorId);
      if (!row) continue;
      if (row.status === "paused") {
        return {
          blocked: true,
          reason: row.status_reason
            ? String(row.status_reason)
            : "Parent merchant is suspended",
          pausedOrgId: row.id,
        };
      }
      if (row.type === "merchant") break;
    }
  }
  return { blocked: false, reason: null, pausedOrgId: null };
}

/**
 * @param {import("http").ServerResponse} res
 * @param {object} org
 * @param {(status: number, code: string, message: string) => void} sendErrorFn
 * @returns {Promise<boolean>} true if blocked (response already sent)
 */
export async function denyIfOrgSuspended(res, org, sendErrorFn) {
  const block = await resolveOrgSuspendBlock(org);
  if (!block.blocked) return false;
  sendErrorFn(
    res,
    403,
    "org_paused",
    block.reason || "Account is suspended; this action is read-only",
  );
  return true;
}
