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

/** Org operational status (B2 suspend / resume). */
export const ORG_STATUSES = ["active", "paused"];

/** Phase 1 default (Business-Model Decision 4). */
export const DEFAULT_MAX_AGENT_DEPTH = 2;

/**
 * Map a DB row to OpenAPI OrgAccount.
 * @param {{ id: string, type: string, name: string, parent_id: string | null, structure?: string | null, status?: string, country?: string | null, billing_email?: string | null, legal_name?: string | null, created_at?: Date | string }} row
 */
export function toOrgAccount(row) {
  /** @type {{ id: string, type: string, name: string, parentId: string | null, status: string, structure?: string, country?: string, billingEmail?: string, legalName?: string, createdAt?: string }} */
  const account = {
    id: row.id,
    type: row.type,
    name: row.name,
    parentId: row.parent_id ?? null,
    status: row.status === "paused" ? "paused" : "active",
  };
  if (row.structure) {
    account.structure = row.structure;
  }
  if (row.country) {
    account.country = row.country;
  }
  if (row.billing_email) {
    account.billingEmail = row.billing_email;
  }
  if (row.legal_name) {
    account.legalName = row.legal_name;
  }
  if (row.created_at) {
    account.createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();
  }
  return account;
}
