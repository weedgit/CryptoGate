export const AUDIT_ACTIONS = {
  login: "login",
  logout: "logout",
  mfaEnroll: "mfa_enroll",
  mfaVerifyEnroll: "mfa_verify_enroll",
  mfaVerifyLogin: "mfa_verify_login",
  orgCreate: "org_create",
  orgStatus: "org_status",
  orgDelete: "org_delete",
  orgUserInvite: "org_user_invite",
  orgUserRole: "org_user_role",
  orgUserPause: "org_user_pause",
  orgUserResume: "org_user_resume",
  orgUserRemove: "org_user_remove",
  settlementPut: "settlement_put",
  matchingModePut: "matching_mode_put",
  xpubPut: "xpub_put",
  webhookRegister: "webhook_register",
  webhookDelete: "webhook_delete",
  webhookResend: "webhook_resend",
  serviceBillIssue: "service_bill_issue",
  serviceBillMarkPaid: "service_bill_mark_paid",
  serviceBillVoid: "service_bill_void",
  serviceBillAdjust: "service_bill_adjust",
  apiKeyCreate: "api_key_create",
  apiKeyRevoke: "api_key_revoke",
  apiKeyRotate: "api_key_rotate",
  feeTierPut: "fee_tier_put",
  orgPolicyPut: "org_policy_put",
  billingWalletPut: "billing_wallet_put",
  merchantCommercialPut: "merchant_commercial_put",
  agentPayoutPut: "agent_payout_put",
  commissionPayoutUpsert: "commission_payout_upsert",
  commissionPayoutMarkPaid: "commission_payout_mark_paid",
  agentCommissionPut: "agent_commission_put",
  enterpriseRateDecide: "enterprise_rate_decide",
  complianceOverride: "compliance_override",
  siteOverrideRequest: "site_override_request",
  siteOverrideDecide: "site_override_decide",
  passwordResetRequest: "password_reset_request",
  passwordResetComplete: "password_reset_complete",
  profileUpdate: "profile_update",
};

const SECRET_KEY = /secret|password|token|mnemonic|cookie|authorization|xpub/i;

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
