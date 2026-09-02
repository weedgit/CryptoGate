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
