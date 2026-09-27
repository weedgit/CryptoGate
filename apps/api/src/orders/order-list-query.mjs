import { OrderStatus } from "@paymentgate/domain";

const STATUS_VALUES = new Set(Object.values(OrderStatus));
/** Virtual list filter: expired + failed + cancelled. */
export const CLOSED_ORDER_STATUSES = ["expired", "failed", "cancelled"];
/** Virtual list filter: pending_payment + verifying. */
export const OPEN_ORDER_STATUSES = ["pending_payment", "verifying"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const JSON_DEFAULT_LIMIT = 100;
export const JSON_MAX_LIMIT = 200;
export const CSV_DEFAULT_LIMIT = 5000;
export const CSV_MAX_LIMIT = 5000;

/** Max period span without orgId (platform-wide history). */
export const MAX_UNBOUNDED_SPAN_MS = 31 * 24 * 60 * 60 * 1000;
/** Max period span when orgId / subtree is set. */
export const MAX_SCOPED_SPAN_MS = 366 * 24 * 60 * 60 * 1000;

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
 * @param {string | null} raw
 */
function parseIncludeSubtree(raw) {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {string | null} raw
 * @returns {{ ok: true, value: string | null } | { ok: false, message: string }}
 */
function parseIsoDate(raw) {
  if (raw == null || raw === "") return { ok: true, value: null };
  const t = raw.trim();
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) {
    return { ok: false, message: "createdFrom/createdTo must be ISO date-time" };
  }
  return { ok: true, value: new Date(ms).toISOString() };
}

/**
 * Open triage statuses may omit a period when listing platform-wide.
 * @param {string | null} status
 * @param {string[] | null} statuses
 */
export function isOpenTriageFilter(status, statuses) {
  if (status === "payment_anomaly" || status === "pending_payment" || status === "verifying") {
    return true;
  }
  if (statuses && statuses.length > 0) {
    return statuses.every((s) => OPEN_ORDER_STATUSES.includes(s));
  }
  return false;
}

/**
 * Enforce period / org bounds for heavy history queries.
 * @param {{
 *   status: string | null,
 *   statuses: string[] | null,
 *   orgId: string | null,
 *   createdFrom: string | null,
 *   createdTo: string | null,
 * }} parsed
 * @param {{ hasOrgScope: boolean }} ctx — true when orgId or equivalent tree filter is applied
 */
export function assertListOrdersBounds(parsed, ctx) {
  const scoped = Boolean(parsed.orgId) || ctx.hasOrgScope;
  if (isOpenTriageFilter(parsed.status, parsed.statuses)) {
    if (parsed.createdFrom && parsed.createdTo) {
      const span =
        Date.parse(parsed.createdTo) - Date.parse(parsed.createdFrom);
      const max = scoped ? MAX_SCOPED_SPAN_MS : MAX_UNBOUNDED_SPAN_MS;
      if (span < 0) {
        return {
          ok: false,
          status: 400,
          code: "invalid_request",
          message: "createdTo must be ≥ createdFrom",
        };
      }
      if (span > max) {
        return {
          ok: false,
          status: 400,
          code: "invalid_request",
          message: scoped
            ? "Period too long (max 366 days with merchant or site)"
            : "Period too long (max 31 days without merchant or site)",
        };
      }
    }
    return { ok: true };
  }

  if (!scoped) {
    if (!parsed.createdFrom || !parsed.createdTo) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message:
          "Select a merchant or site, or a bounded period (max 31 days) for history",
      };
    }
    const span = Date.parse(parsed.createdTo) - Date.parse(parsed.createdFrom);
    if (span < 0) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "createdTo must be ≥ createdFrom",
      };
    }
    if (span > MAX_UNBOUNDED_SPAN_MS) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message:
          "Period too long (max 31 days without merchant or site)",
      };
    }
    return { ok: true };
  }

  if (parsed.createdFrom && parsed.createdTo) {
    const span = Date.parse(parsed.createdTo) - Date.parse(parsed.createdFrom);
    if (span < 0) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "createdTo must be ≥ createdFrom",
      };
    }
    if (span > MAX_SCOPED_SPAN_MS) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "Period too long (max 366 days with merchant or site)",
      };
    }
  }
  return { ok: true };
}

/**
 * Additive query: format, status, orgId, includeSubtree, created*, q, limit, offset.
 * @param {URLSearchParams} searchParams
 * @param {string | string[] | undefined} acceptHeader
 * @returns {{
 *   ok: true,
 *   csv: boolean,
 *   status: string | null,
 *   statuses: string[] | null,
 *   orgId: string | null,
 *   includeSubtree: boolean,
 *   agentOrgId: string | null,
 *   createdBy: string | null,
 *   createdFrom: string | null,
 *   createdTo: string | null,
 *   q: string | null,
 *   asset: string | null,
 *   network: string | null,
 *   limit: number,
 *   offset: number,
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
  /** @type {string[] | null} */
  let statuses = null;
  if (status === "closed") {
    statuses = [...CLOSED_ORDER_STATUSES];
  } else if (status === "open") {
    statuses = [...OPEN_ORDER_STATUSES];
  } else if (status && !STATUS_VALUES.has(status)) {
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

  const includeSubtree = parseIncludeSubtree(searchParams.get("includeSubtree"));
  if (includeSubtree && !orgId) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "includeSubtree requires orgId",
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

  const createdByRaw = searchParams.get("createdBy");
  const createdBy =
    createdByRaw && createdByRaw.trim() ? createdByRaw.trim() : null;
  if (createdBy && !UUID_RE.test(createdBy)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "createdBy must be a UUID",
    };
  }

  const fromParsed = parseIsoDate(searchParams.get("createdFrom"));
  if (!fromParsed.ok) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: fromParsed.message,
    };
  }
  const toParsed = parseIsoDate(searchParams.get("createdTo"));
  if (!toParsed.ok) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: toParsed.message,
    };
  }

  const qRaw = searchParams.get("q");
  let q = qRaw && qRaw.trim() ? qRaw.trim() : null;
  if (q && !UUID_RE.test(q) && !/^\d{4,}$/.test(q) && q.length < 2) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "q must be an order number, UUID, or reference (min 2 characters)",
    };
  }

  const assetRaw = searchParams.get("asset");
  const asset = assetRaw && assetRaw.trim() ? assetRaw.trim() : null;
  const networkRaw = searchParams.get("network");
  const network = networkRaw && networkRaw.trim() ? networkRaw.trim() : null;

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

  const offsetRaw = searchParams.get("offset");
  let offset = 0;
  if (offsetRaw != null && offsetRaw !== "") {
    if (!/^\d+$/.test(offsetRaw)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "offset must be an integer ≥ 0",
      };
    }
    offset = Number(offsetRaw);
  }

  return {
    ok: true,
    csv,
    status: statuses ? null : status,
    statuses,
    orgId,
    includeSubtree,
    agentOrgId,
    createdBy,
    createdFrom: fromParsed.value,
    createdTo: toParsed.value,
    q,
    asset,
    network,
    limit,
    offset,
  };
}
