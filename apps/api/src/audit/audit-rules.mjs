export const AUDIT_ACTIONS = {
  login: "login",
  logout: "logout",
  mfaEnroll: "mfa_enroll",
  mfaVerifyEnroll: "mfa_verify_enroll",
  mfaVerifyLogin: "mfa_verify_login",
  orgCreate: "org_create",
  orgUserInvite: "org_user_invite",
  orgUserRole: "org_user_role",
  settlementPut: "settlement_put",
  matchingModePut: "matching_mode_put",
};

const SECRET_KEY = /secret|password|token|mnemonic|cookie|authorization/i;

/**
 * Drop secret-like keys; keep scalars only.
 * @param {unknown} metadata
 * @returns {Record<string, string | number | boolean | null>}
 */
export function sanitizeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  /** @type {Record<string, string | number | boolean | null>} */
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY.test(key)) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}
