/**
 * MFA step-up for sensitive platform / fund writes.
 */
import { findUserMfaById } from "../auth/users.mjs";
import { verifyTotp } from "../auth/totp.mjs";
import { sendError } from "../http/json.mjs";

const INVALID_MFA = "Invalid MFA code";

/**
 * @param {{ userId: string }} caller
 * @param {unknown} mfaCodeRaw
 * @param {import("http").ServerResponse} res
 * @returns {Promise<boolean>} true if verified
 */
export async function requireMfaStepUp(caller, mfaCodeRaw, res) {
  const mfaCode =
    typeof mfaCodeRaw === "string" ? mfaCodeRaw.trim() : "";
  if (mfaCode.length < 6 || mfaCode.length > 8) {
    sendError(res, 400, "invalid_request", "mfaCode is required (6–8 digits)");
    return false;
  }
  const user = await findUserMfaById(caller.userId);
  if (!user?.mfaEnrolled || !user.mfaSecret) {
    sendError(res, 403, "mfa_required", "MFA enrollment required");
    return false;
  }
  if (!verifyTotp(user.mfaSecret, mfaCode)) {
    sendError(res, 401, "invalid_mfa", INVALID_MFA);
    return false;
  }
  return true;
}
