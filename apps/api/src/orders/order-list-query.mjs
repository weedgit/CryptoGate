import { OrderStatus } from "@paymentgate/domain";

const STATUS_VALUES = new Set(Object.values(OrderStatus));
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const JSON_DEFAULT_LIMIT = 100;
export const JSON_MAX_LIMIT = 200;
export const CSV_DEFAULT_LIMIT = 5000;
export const CSV_MAX_LIMIT = 5000;

/**
 * @param {string | null} raw
 * @param {number} fallback
 * @param {number} max
 * @returns {number | null}
 */
function parseLimit(raw, fallback, max) {
  if (raw == null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (n < 1) return null;
  return Math.min(n, max);
}

/**
 * Additive query: format, status, orgId, limit. OpenAPI list has no params yet.
 * @param {URLSearchParams} searchParams
 * @param {string | string[] | undefined} acceptHeader
 * @returns {{
 *   ok: true,
 *   csv: boolean,
 *   status: string | null,
 *   orgId: string | null,
 *   agentOrgId: string | null,
 *   limit: number,
 * } | { ok: false, status: number, code: string, message: string }}
 */
export function parseListOrdersQuery(searchParams, acceptHeader) {
  const format = searchParams.get("format");
  let csv = false;
  if (format === "csv") {
    csv = true;
  } else if (format == null || format === "" || format === "json") {
    const accept = Array.isArray(acceptHeader) ? acceptHeader.join(",") : acceptHeader;
    csv =
      format !== "json" &&
      typeof accept === "string" &&
      /\btext\/csv\b/i.test(accept);
  } else {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "format must be json or csv",
    };
  }

  const statusRaw = searchParams.get("status");
  const status = statusRaw && statusRaw.trim() ? statusRaw.trim() : null;
  if (status && !STATUS_VALUES.has(status)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Unknown order status",
    };
  }

  const orgRaw = searchParams.get("orgId");
  const orgId = orgRaw && orgRaw.trim() ? orgRaw.trim() : null;
  if (orgId && !UUID_RE.test(orgId)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "orgId must be a UUID",
    };
  }

  const agentOrgRaw = searchParams.get("agentOrgId");
  const agentOrgId =
    agentOrgRaw && agentOrgRaw.trim() ? agentOrgRaw.trim() : null;
  if (agentOrgId && !UUID_RE.test(agentOrgId)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "agentOrgId must be a UUID",
    };
  }

  const max = csv ? CSV_MAX_LIMIT : JSON_MAX_LIMIT;
  const fallback = csv ? CSV_DEFAULT_LIMIT : JSON_DEFAULT_LIMIT;
  const limit = parseLimit(searchParams.get("limit"), fallback, max);
  if (limit == null) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "limit must be a positive integer",
    };
  }

  return { ok: true, csv, status, orgId, agentOrgId, limit };
}
