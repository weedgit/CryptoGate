/** OpenAPI / domain org type strings. */
export const ORG_TYPES = [
  "platform",
  "agent",
  "agent_sub",
  "merchant",
  "merchant_site",
];

/** Org operational status (B2 suspend / resume). */
export const ORG_STATUSES = ["active", "paused"];

/** Preset brand icons for agent / merchant portals. */
export const ORG_ICON_KEYS = [
  "mark",
  "hex",
  "store",
  "globe",
  "shield",
  "spark",
  "node",
  "grid",
];

/** Max length for custom icon data-URL stored in icon_key. */
export const ORG_ICON_DATA_URL_MAX_LEN = 180_000;

const ORG_ICON_DATA_URL_RE =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isOrgIconValue(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (ORG_ICON_KEYS.includes(value)) return true;
  if (value.length > ORG_ICON_DATA_URL_MAX_LEN) return false;
  return ORG_ICON_DATA_URL_RE.test(value);
}

/** Phase 1 default (Business-Model Decision 4). */
export const DEFAULT_MAX_AGENT_DEPTH = 2;

/**
 * Map a DB row to OpenAPI OrgAccount.
 * @param {{ id: string, type: string, name: string, parent_id: string | null, status?: string, country?: string | null, legal_name?: string | null, icon_key?: string | null, created_at?: Date | string }} row
 */
export function toOrgAccount(row) {
  /** @type {{ id: string, type: string, name: string, parentId: string | null, status: string, country?: string, legalName?: string, iconKey?: string, createdAt?: string }} */
  const account = {
    id: row.id,
    type: row.type,
    name: row.name,
    parentId: row.parent_id ?? null,
    status: row.status === "paused" ? "paused" : "active",
  };
  if (row.country) {
    account.country = row.country;
  }
  if (row.legal_name) {
    account.legalName = row.legal_name;
  }
  if (row.icon_key && isOrgIconValue(row.icon_key)) {
    account.iconKey = row.icon_key;
  }
  if (row.created_at) {
    account.createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();
  }
  return account;
}
