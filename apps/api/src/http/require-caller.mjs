import { loadCaller } from "../orgs/org-access.mjs";
import { requireSession } from "./require-session.mjs";

/**
 * Session plus org memberships for policy checks.
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
  const auth = await requireSession(req, res);
  if (!auth) return null;
  const caller = await loadCaller(auth.userId);
  return { ...auth, ...caller };
}
