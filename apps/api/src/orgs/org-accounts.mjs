/** OpenAPI / domain org type strings. */
export const ORG_TYPES = [
  "platform",
  "agent",
  "agent_sub",
  "merchant",
  "merchant_site",
];

/** OpenAPI OrgAccount.structure — merchant accounts only. */
export const MERCHANT_STRUCTURES = ["single_location", "multi_location"];

/** Phase 1 default (Business-Model Decision 4). */
export const DEFAULT_MAX_AGENT_DEPTH = 2;

/**
 * Map a DB row to OpenAPI OrgAccount.
 * @param {{ id: string, type: string, name: string, parent_id: string | null, structure?: string | null }} row
 */
export function toOrgAccount(row) {
  /** @type {{ id: string, type: string, name: string, parentId: string | null, structure?: string }} */
  const account = {
    id: row.id,
    type: row.type,
    name: row.name,
    parentId: row.parent_id ?? null,
  };
  if (row.structure) {
    account.structure = row.structure;
  }
  return account;
}
