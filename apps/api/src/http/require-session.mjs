import { findActiveSessionByToken } from "../auth/sessions.mjs";
import { getSessionToken } from "./cookies.mjs";
import { sendError } from "./json.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<{ token: string, userId: string } | null>}
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
  return { token, userId: row.userId };
}
