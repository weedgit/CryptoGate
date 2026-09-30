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
  if (verb === "PUT" && /^\/v1\/orgs\/[^/]+\/notification-preferences$/.test(path)) return true;
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
  const block = await liveActionBlock(caller, method, path);
  if (!block) return false;
  sendError(res, block.status, block.code, block.message);
  return true;
}

/**
 * Why a gated live action would be refused for this caller, or null when allowed.
 * @param {{ userId: string, memberships?: object[], apiKeyScopes?: string[], platformOperator?: boolean }} caller
 * @param {string} method
 * @param {string} path
 * @returns {Promise<{ status: number, code: string, message: string } | null>}
 */
export async function liveActionBlock(caller, method, path) {
  if (caller.apiKeyScopes || caller.platformOperator) return null;

  const user = await findUserById(caller.userId);
  const setup = await loadOrgSetupStatus(caller.memberships ?? [], user);
  if (!setup.setupReady) {
    if (!setup.contactVerified) {
      return {
        status: 403,
        code: "contact_unverified",
        message: "Verify email and phone before this action",
      };
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
    return {
      status: 403,
      code: "org_setup_incomplete",
      message: `Finish account setup before this action (${missing.join("; ")})`,
    };
  }

  // Merchants must pay activation before live actions (except viewing / setup).
  if (
    setup.setupOrgType === "merchant" &&
    setup.setupOrgId &&
    !isActivationPayAllowedPath(method, path)
  ) {
    const { merchantHasBillingAnchor } = await import(
      "../commercial/merchant-commercial-store.mjs"
    );
    const paid = await merchantHasBillingAnchor(setup.setupOrgId);
    if (!paid) {
      return {
        status: 403,
        code: "activation_payment_required",
        message: "Pay the account activation fee before using merchant features",
      };
    }
  }

  return null;
}

/**
 * Allow service-bill checkout and related reads while waiting for activation pay.
 * @param {string} method
 * @param {string} path
 */
function isActivationPayAllowedPath(method, path) {
  const verb = (method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return true;
  // Platform marks paid; merchants mainly need GET checkout. Keep PATCH profile/setup already allowed above.
  if (path.startsWith("/v1/service-bills")) return true;
  return false;
}
