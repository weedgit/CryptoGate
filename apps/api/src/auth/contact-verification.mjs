import { findUserById } from "./users.mjs";
import { sendError } from "../http/json.mjs";
import { loadOrgSetupStatus } from "./org-setup.mjs";

/**
 * @param {{ emailVerified?: boolean, phoneVerified?: boolean } | null} user
 */
export function isContactVerified(user) {
  return Boolean(user?.emailVerified && user?.phoneVerified);
}

/**
 * Session cookie live-actions: platform operators and API keys skip.
 * @param {{ platformOperator?: boolean, apiKeyScopes?: string[] }} caller
 * @param {{ emailVerified?: boolean, phoneVerified?: boolean } | null} user
 */
export function callerNeedsContactVerification(caller, user) {
  if (caller?.apiKeyScopes) return false;
  if (caller?.platformOperator) return false;
  return !isContactVerified(user);
}

/**
 * Mutating /v1 routes except auth — browse (GET) stays open.
 * @param {string} method
 * @param {string} path
 */
export function isContactGatedRequest(method, path) {
  const verb = (method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return false;
  if (!path.startsWith("/v1/")) return false;
  if (path.startsWith("/v1/auth/")) return false;
  return true;
}

/**
 * Mutations that complete org setup (profile / wallet) stay allowed while gated.
 * @param {string} method
 * @param {string} path
 */
export function isSetupAllowedMutation(method, path) {
  const verb = (method || "GET").toUpperCase();
  if (verb === "PATCH" && /^\/v1\/orgs\/[^/]+$/.test(path)) return true;
  if (verb === "PUT" && /^\/v1\/orgs\/[^/]+\/settlement$/.test(path)) return true;
  if (verb === "PUT" && /^\/v1\/orgs\/[^/]+\/agent-payout$/.test(path)) return true;
  if (verb === "PATCH" && path === "/v1/auth/profile") return true;
  if (verb === "POST" && path.startsWith("/v1/auth/contact/")) return true;
  return false;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} method
 * @param {string} path
 * @returns {Promise<boolean>} true when the response was already sent
 */
export async function rejectUnverifiedLiveAction(req, res, method, path) {
  if (!isContactGatedRequest(method, path)) return false;
  if (isSetupAllowedMutation(method, path)) return false;

  const { requireCaller } = await import("../http/require-caller.mjs");
  const caller = await requireCaller(req, res);
  if (!caller) return true;
  if (caller.apiKeyScopes || caller.platformOperator) return false;

  const user = await findUserById(caller.userId);
  const setup = await loadOrgSetupStatus(caller.memberships ?? [], user);
  if (setup.setupReady) return false;

  if (!setup.contactVerified) {
    sendError(
      res,
      403,
      "contact_unverified",
      "Verify email and phone before this action",
    );
    return true;
  }

  const missing =
    Array.isArray(setup.missing) && setup.missing.length > 0
      ? setup.missing.filter(
          (m) => m !== "email and phone verification",
        )
      : [
          ...(!setup.personComplete ? ["first name, last name, timezone"] : []),
          ...(!setup.profileComplete ? ["org profile"] : []),
          ...(!setup.walletSet ? ["wallet address"] : []),
        ];
  sendError(
    res,
    403,
    "org_setup_incomplete",
    `Finish account setup before this action (${missing.join("; ")})`,
  );
  return true;
}
