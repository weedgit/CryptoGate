import { csvCell } from "../orders/order-csv.mjs";

export const AUDIT_CSV_HEADERS = [
  "createdAt",
  "action",
  "actorUserId",
  "actorEmail",
  "orgId",
  "orgName",
  "role",
  "ip",
  "resource",
  "metadata",
];

/**
 * @param {Record<string, unknown>} metadata
 * @param {string[]} keys
 */
function firstText(metadata, keys) {
  for (const key of keys) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Same subject precedence as the portal Audit table's Resource column.
 * @param {Record<string, unknown>} metadata
 */
function resourceLabel(metadata) {
  const text =
    firstText(metadata, ["displayName", "name"]) ||
    firstText(metadata, ["email", "invitedEmail", "targetEmail"]) ||
    firstText(metadata, ["phone", "newPhone", "destination"]);
  if (text) return text;
  for (const key of ["billId", "orderId", "resource", "resourceId"]) {
    const v = metadata[key];
    if (v != null && String(v).trim()) return String(v);
  }
  return "";
}

/** @param {unknown} value */
function iso(value) {
  if (value == null) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

export function auditCsvHeaderLine() {
  return `${AUDIT_CSV_HEADERS.map(csvCell).join(",")}\n`;
}

/**
 * @param {{
 *   created_at: unknown,
 *   action: string,
 *   actor_user_id?: string | null,
 *   actor_email?: string | null,
 *   org_id?: string | null,
 *   org_name?: string | null,
 *   metadata?: unknown,
 * }} row enriched audit row
 */
export function auditCsvLine(row) {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? /** @type {Record<string, unknown>} */ (row.metadata)
      : {};
  return `${[
    iso(row.created_at),
    row.action,
    row.actor_user_id ?? "",
    row.actor_email ?? "",
    row.org_id ?? "",
    row.org_name ?? "",
    firstText(metadata, ["role", "actorRole", "callerRole"]),
    firstText(metadata, ["ip", "ipAddress", "clientIp", "remoteAddr"]),
    resourceLabel(metadata),
    JSON.stringify(metadata),
  ]
    .map(csvCell)
    .join(",")}\n`;
}
