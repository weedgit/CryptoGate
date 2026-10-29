import { sendError } from "./json.mjs";
import { findUserById } from "../auth/users.mjs";
import { loadCaller, isPlatformOwner } from "../orgs/org-access.mjs";
import { findMembership } from "../orgs/membership-store.mjs";
import { isPlatformOperator } from "../orgs/membership-rules.mjs";
import { mustEnrollMfa } from "../orgs/role-policy.mjs";
import { requireSession } from "./require-session.mjs";
import { authenticateApiKeyRequest } from "../signing/verify-api-key.mjs";
import { signingRejectMessage } from "../signing/signing-rules.mjs";
import { apiKeyScopeForRoute } from "../api-keys/api-key-rules.mjs";

/**
 * @param {import("node:http").IncomingHttpHeaders} headers
 */
function apiKeyHeader(headers) {
  const raw = headers["x-api-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Session callers pass. Machine keys must include `scope` (orders|webhooks).
 * @param {{ apiKeyScopes?: string[] } | null} caller
 * @param {import("node:http").ServerResponse} res
 * @param {string} scope
 */
export function assertApiKeyScope(caller, res, scope) {
  if (!caller?.apiKeyScopes) return true;
  if (caller.apiKeyScopes.includes(scope)) return true;
  sendError(
    res,
    403,
    "insufficient_scope",
    `API key is missing required scope: ${scope}`,
  );
  return false;
}

/**
 * Routes (besides requireSession-only auth routes) open to a session whose account still has
 * a forced setup step: replace its temporary password (C2), then enroll MFA (H9).
 * @param {import("node:http").IncomingMessage} req
 * @param {"password" | "mfa"} step
 */
function isPendingSetupAllowed(req, step) {
  const method = req.method ?? "GET";
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (method === "GET" && path === "/v1/auth/session") return true;
  return step === "mfa" && method === "POST" && path === "/v1/auth/mfa/enroll";
}

/**
 * Resolved caller per request. A signed API-key request's nonce is single-use, so the contact
 * gate and the route handler must share one authentication instead of each verifying (H6).
 * @type {WeakMap<import("node:http").IncomingMessage, object>}
 */
const callerByRequest = new WeakMap();

/**
 * Session cookie or signed X-Api-Key. Guest /payment and login skip this.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<{
 *   token: string,
 *   userId: string,
 *   memberships: { orgId: string, userId: string, role: string, orgType: string }[],
 *   platformOwner: boolean,
 *   platformOperator: boolean,
 * } | null>}
 */
export async function requireCaller(req, res) {
  const known = callerByRequest.get(req);
  if (known) return known;
  const caller = await resolveCaller(req, res);
  if (caller) callerByRequest.set(req, caller);
  return caller;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function resolveCaller(req, res) {
  if (apiKeyHeader(req.headers)) {
    const auth = await authenticateApiKeyRequest(req);
    if (!auth.ok) {
      if (auth.code === "ip_not_allowed") {
        sendError(res, 403, "ip_not_allowed", "API key is not allowed from this IP");
        return null;
      }
      sendError(res, 401, auth.code, signingRejectMessage());
      return null;
    }
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const scope = apiKeyScopeForRoute(req.method ?? "GET", path);
    if (!scope) {
      sendError(
        res,
        403,
        "api_key_route_forbidden",
        "API keys can only call order and webhook endpoints",
      );
      return null;
    }
    if (!assertApiKeyScope({ apiKeyScopes: auth.key.scopes }, res, scope)) return null;
    const membership = await findMembership(auth.key.orgId, auth.key.userId);
    if (!membership) {
      sendError(res, 401, "signature_invalid", signingRejectMessage());
      return null;
    }
    const memberships = [membership];
    return {
      token: auth.key.keyId,
      userId: auth.key.userId,
      memberships,
      platformOwner: isPlatformOwner(memberships),
      platformOperator: isPlatformOperator(memberships),
      apiKeyScopes: auth.key.scopes,
    };
  }

  const session = await requireSession(req, res);
  if (!session) return null;

  const user = await findUserById(session.userId);
  // Enrolled users must complete TOTP before privileged routes (verify uses requireSession only).
  if (!session.mfaVerified && user?.mfaEnrolled) {
    sendError(res, 401, "mfa_required", "MFA verification required");
    return null;
  }
  // Temporary (invite) passwords: nothing but the session read until changed (C2).
  if (!session.terminalId && user?.mustChangePassword && !isPendingSetupAllowed(req, "password")) {
    sendError(
      res,
      403,
      "password_change_required",
      "Change your temporary password to continue",
    );
    return null;
  }

  const caller = await loadCaller(session.userId);
  if (session.terminalId) {
    const memberships = caller.memberships.filter((m) => m.orgId === session.terminalOrgId);
    return { ...session, memberships, platformOwner: false, platformOperator: false };
  }
  // Platform / merchant Owners and Admins must enroll before anything else (H9); the portal
  // gate alone could be skipped by calling the API directly.
  if (
    mustEnrollMfa(caller.memberships) &&
    !user?.mfaEnrolled &&
    !isPendingSetupAllowed(req, "mfa")
  ) {
    sendError(res, 403, "mfa_enrollment_required", "Set up two-factor authentication to continue");
    return null;
  }
  return { ...session, ...caller };
}
