import { findActiveSessionByToken } from "../auth/sessions.mjs";
import { findMembership } from "../orgs/membership-store.mjs";
import { isPosSessionPathAllowed } from "../pos/pos-session-scope.mjs";
import { getSessionToken } from "./cookies.mjs";
import { sendError } from "./json.mjs";
import { touchSessionFromCookie } from "./session-touch.mjs";

/**
 * Cookie session only (no MFA step-up gate). Used by MFA verify / logout.
 * PIN sessions are re-checked on every request: the terminal must still be active,
 * the person must still be an active member of its org, and the route must be POS scope.
 * They are never extended (fixed length from unlock).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<{
 *   token: string,
 *   userId: string,
 *   mfaVerified: boolean,
 *   terminalId: string | null,
 *   terminalOrgId: string | null,
 * } | null>}
 */
export async function requireSession(req, res) {
  const token = getSessionToken(req.headers.cookie);
  if (!token) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return null;
  }
  const row = await findActiveSessionByToken(token);
  if (!row) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return null;
  }
  if (row.terminalId) {
    if (!row.terminalActive) {
      sendError(res, 401, "terminal_revoked", "This POS terminal is no longer bound");
      return null;
    }
    const membership = row.terminalOrgId
      ? await findMembership(row.terminalOrgId, row.userId)
      : null;
    if (!membership) {
      sendError(res, 401, "unauthenticated", "Not authenticated");
      return null;
    }
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (!isPosSessionPathAllowed(req.method ?? "GET", path, row.terminalOrgId)) {
      sendError(
        res,
        403,
        "pos_session_scope",
        "This action isn't available on a POS terminal",
      );
      return null;
    }
  } else {
    await touchSessionFromCookie(res, token, row.userId, row.expiresAt);
  }
  return {
    token,
    userId: row.userId,
    mfaVerified: row.mfaVerified,
    terminalId: row.terminalId,
    terminalOrgId: row.terminalOrgId,
  };
}
