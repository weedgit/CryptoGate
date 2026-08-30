import { NetworkId } from "@cryptogate/domain";

const KNOWN_NETWORKS = new Set(Object.values(NetworkId));

/**
 * @param {string} network
 */
export function isKnownNetworkId(network) {
  return typeof network === "string" && KNOWN_NETWORKS.has(network);
}

/**
 * @param {unknown} body
 * @returns {{
 *   ok: true,
 *   active: boolean,
 *   message: string | null,
 *   endsAt: string | null,
 * } | {
 *   ok: false,
 *   status: number,
 *   code: string,
 *   message: string,
 * }}
 */
export function validatePutNetworkMaintenanceBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  if (typeof body.active !== "boolean") {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "active must be a boolean",
    };
  }

  let message = null;
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== "string") {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "message must be a string or null",
      };
    }
    const trimmed = body.message.trim();
    if (trimmed.length > 500) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "message must be at most 500 characters",
      };
    }
    message = trimmed || null;
  }

  let endsAt = null;
  if (body.endsAt !== undefined && body.endsAt !== null) {
    if (typeof body.endsAt !== "string") {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "endsAt must be an ISO-8601 string or null",
      };
    }
    const ms = Date.parse(body.endsAt);
    if (!Number.isFinite(ms)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "endsAt must be a valid ISO-8601 timestamp",
      };
    }
    endsAt = new Date(ms).toISOString();
  }

  if (body.active === true && !message) {
    message = "This network is temporarily unavailable for new deposits.";
  }

  return {
    ok: true,
    active: body.active,
    message: body.active ? message : null,
    endsAt: body.active ? endsAt : null,
  };
}

/**
 * Effective maintenance: active flag and optional ends_at still in the future.
 * @param {{ active: boolean, endsAt: string | null } | null | undefined} row
 * @param {number} [nowMs]
 */
export function isMaintenanceEffective(row, nowMs = Date.now()) {
  if (!row?.active) return false;
  if (!row.endsAt) return true;
  const endMs = Date.parse(row.endsAt);
  if (!Number.isFinite(endMs)) return true;
  return endMs > nowMs;
}
