import { randomBytes } from "node:crypto";
import {
  API_KEY_MAX_PER_ORG,
  API_KEY_SCOPES,
  ApiKeyScope,
} from "@paymentgate/domain";

export { API_KEY_MAX_PER_ORG, API_KEY_SCOPES, ApiKeyScope };

/**
 * Public X-Api-Key value (prefix cgk_).
 */
export function generateApiKeyId() {
  return `cgk_live_${randomBytes(12).toString("hex")}`;
}

/**
 * HMAC secret — returned once on create/rotate; never log.
 */
export function generateApiKeySecret() {
  return randomBytes(32).toString("hex");
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, expiresAt: Date | null | undefined } | { ok: false, code: string, message: string }}
 *   expiresAt undefined means "omit / keep previous" (rotate only).
 */
export function parseOptionalExpiresAt(value, { allowOmit = false } = {}) {
  if (value === undefined) {
    if (allowOmit) return { ok: true, expiresAt: undefined };
    return { ok: true, expiresAt: null };
  }
  if (value === null) return { ok: true, expiresAt: null };
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false,
      code: "invalid_expires_at",
      message: "expiresAt must be an ISO date-time or null",
    };
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return {
      ok: false,
      code: "invalid_expires_at",
      message: "expiresAt must be an ISO date-time or null",
    };
  }
  if (ms <= Date.now()) {
    return {
      ok: false,
      code: "invalid_expires_at",
      message: "expiresAt must be in the future",
    };
  }
  return { ok: true, expiresAt: new Date(ms) };
}

const SCOPE_SET = new Set(API_KEY_SCOPES);

/**
 * @param {unknown} value
 * @returns {{ ok: true, scopes: string[] } | { ok: false, code: string, message: string }}
 */
export function normalizeApiKeyScopes(value) {
  if (value == null) {
    return { ok: true, scopes: [...API_KEY_SCOPES] };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false,
      code: "invalid_scopes",
      message: "scopes must be a non-empty array of orders|webhooks",
    };
  }
  /** @type {string[]} */
  const out = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !SCOPE_SET.has(raw)) {
      return {
        ok: false,
        code: "invalid_scopes",
        message: "scopes must be orders and/or webhooks",
      };
    }
    if (!out.includes(raw)) out.push(raw);
  }
  return { ok: true, scopes: out };
}

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\/(?:3[0-2]|[12]?\d))?$/;
const IPV6_RE = /^[0-9a-fA-F:]+(?:\/(?:12[0-8]|1[01]\d|[1-9]?\d))?$/;

/**
 * @param {string} entry
 */
export function isValidIpAllowlistEntry(entry) {
  const v = entry.trim();
  if (!v || v.length > 64) return false;
  if (IPV4_RE.test(v)) return true;
  if (v.includes(":") && IPV6_RE.test(v)) return true;
  return false;
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, ipAllowlist: string[] } | { ok: false, code: string, message: string }}
 */
export function normalizeIpAllowlist(value) {
  if (value == null) return { ok: true, ipAllowlist: [] };
  if (!Array.isArray(value)) {
    return {
      ok: false,
      code: "invalid_ip_allowlist",
      message: "ipAllowlist must be an array of IPs or CIDRs",
    };
  }
  if (value.length > 32) {
    return {
      ok: false,
      code: "invalid_ip_allowlist",
      message: "ipAllowlist supports at most 32 entries",
    };
  }
  /** @type {string[]} */
  const out = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !isValidIpAllowlistEntry(raw)) {
      return {
        ok: false,
        code: "invalid_ip_allowlist",
        message: "Each ipAllowlist entry must be an IPv4/IPv6 address or CIDR",
      };
    }
    const trimmed = raw.trim();
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return { ok: true, ipAllowlist: out };
}

/**
 * @param {string} ip
 * @param {string[]} allowlist empty = allow all
 */
export function ipAllowed(ip, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;
  const client = normalizeClientIp(ip);
  if (!client) return false;
  for (const entry of allowlist) {
    if (ipMatchesEntry(client, entry)) return true;
  }
  return false;
}

/**
 * @param {string} ip
 */
export function normalizeClientIp(ip) {
  let v = (ip ?? "").trim();
  if (v.startsWith("::ffff:")) v = v.slice(7);
  return v || "";
}

/**
 * @param {string} client
 * @param {string} entry
 */
function ipMatchesEntry(client, entry) {
  const e = entry.trim();
  if (!e.includes("/")) return client === e;
  const [base, bitsRaw] = e.split("/");
  const bits = Number(bitsRaw);
  if (!Number.isFinite(bits) || bits < 0) return false;
  // IPv4 CIDR only for Phase 1 matching (exact match already covers IPv6 literals).
  if (client.includes(":") || (base ?? "").includes(":")) {
    return client === base;
  }
  const clientNum = ipv4ToInt(client);
  const baseNum = ipv4ToInt(base ?? "");
  if (clientNum == null || baseNum == null || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (clientNum & mask) === (baseNum & mask);
}

/**
 * @param {string} ip
 * @returns {number | null}
 */
function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const octet = Number(p);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) + octet;
  }
  return n >>> 0;
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
export function clientIpFromRequest(req) {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  if (typeof raw === "string" && raw.trim()) {
    return normalizeClientIp(raw.split(",")[0] ?? "");
  }
  return normalizeClientIp(req.socket?.remoteAddress ?? "");
}

/**
 * @param {unknown} body
 */
export function validateCreateApiKeyBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid body" };
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 64) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "label is required (1–64 characters)",
    };
  }
  const exp = parseOptionalExpiresAt(body.expiresAt);
  if (!exp.ok) {
    return { ok: false, status: 400, code: exp.code, message: exp.message };
  }
  const scopes = normalizeApiKeyScopes(body.scopes);
  if (!scopes.ok) {
    return { ok: false, status: 400, code: scopes.code, message: scopes.message };
  }
  const ips = normalizeIpAllowlist(body.ipAllowlist);
  if (!ips.ok) {
    return { ok: false, status: 400, code: ips.code, message: ips.message };
  }
  const orgId =
    typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
  return {
    ok: true,
    label,
    expiresAt: exp.expiresAt ?? null,
    scopes: scopes.scopes,
    ipAllowlist: ips.ipAllowlist,
    orgId,
  };
}

/**
 * @param {unknown} body
 */
export function validateRotateApiKeyBody(body) {
  if (body == null) {
    return {
      ok: true,
      expiresAt: undefined,
      scopes: undefined,
      ipAllowlist: undefined,
      orgId: null,
    };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid body" };
  }
  const exp = parseOptionalExpiresAt(body.expiresAt, {
    allowOmit: !("expiresAt" in body),
  });
  if (!exp.ok) {
    return { ok: false, status: 400, code: exp.code, message: exp.message };
  }
  let scopes;
  if ("scopes" in body) {
    const s = normalizeApiKeyScopes(body.scopes);
    if (!s.ok) {
      return { ok: false, status: 400, code: s.code, message: s.message };
    }
    scopes = s.scopes;
  }
  let ipAllowlist;
  if ("ipAllowlist" in body) {
    const ips = normalizeIpAllowlist(body.ipAllowlist);
    if (!ips.ok) {
      return { ok: false, status: 400, code: ips.code, message: ips.message };
    }
    ipAllowlist = ips.ipAllowlist;
  }
  const orgId =
    typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
  return {
    ok: true,
    expiresAt: exp.expiresAt,
    scopes,
    ipAllowlist,
    orgId,
  };
}

/**
 * Public list shape — never secret.
 * @param {object} row
 */
export function toApiKey(row) {
  const scopes = Array.isArray(row.scopes) ? row.scopes : [...API_KEY_SCOPES];
  const ipAllowlist = Array.isArray(row.ip_allowlist) ? row.ip_allowlist : [];
  return {
    id: row.id,
    orgId: row.org_id,
    keyId: row.key_id,
    label: row.label,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    lastUsedAt: row.last_used_at
      ? row.last_used_at instanceof Date
        ? row.last_used_at.toISOString()
        : String(row.last_used_at)
      : null,
    expiresAt: row.expires_at
      ? row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : String(row.expires_at)
      : null,
    scopes,
    ipAllowlist,
  };
}

/**
 * @param {object} row
 * @param {string} secret
 */
export function toApiKeyCreated(row, secret) {
  return { ...toApiKey(row), secret };
}
