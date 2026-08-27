import { findUserById } from "../auth/users.mjs";
import { loadCaller, isPlatformOwner } from "../orgs/org-access.mjs";
import { findMembership } from "../orgs/membership-store.mjs";
import { isPlatformOperator } from "../orgs/membership-rules.mjs";
import { requireSession } from "./require-session.mjs";
import { sendError } from "./json.mjs";
import { authenticateApiKeyRequest } from "../signing/verify-api-key.mjs";
import { signingRejectMessage } from "../signing/signing-rules.mjs";

/**
 * @param {import("node:http").IncomingHttpHeaders} headers
 */
function apiKeyHeader(headers) {
  const raw = headers["x-api-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

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
  if (apiKeyHeader(req.headers)) {
    const auth = await authenticateApiKeyRequest(req);
    if (!auth.ok) {
      sendError(res, 401, auth.code, signingRejectMessage());
      return null;
    }
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
    };
  }

  const session = await requireSession(req, res);
  if (!session) return null;

  // Enrolled users must complete TOTP before privileged routes (verify uses requireSession only).
  if (!session.mfaVerified) {
    const user = await findUserById(session.userId);
    if (user?.mfaEnrolled) {
      sendError(res, 401, "mfa_required", "MFA verification required");
      return null;
    }
  }

  const caller = await loadCaller(session.userId);
  return { ...session, ...caller };
}
