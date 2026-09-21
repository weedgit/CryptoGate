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
