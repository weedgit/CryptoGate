/**
 * Portal URL helpers for invite / password-reset mail.
 */

export function webBaseUrl() {
  const raw = process.env.WEB_BASE_URL || "http://127.0.0.1:5174";
  return String(raw).replace(/\/$/, "");
}

/** @param {string} orgType */
export function portalSlugForOrgType(orgType) {
  if (orgType === "platform") return "platform";
  if (orgType === "agent" || orgType === "agent_sub") return "agent";
  return "merchant";
}

/**
 * @param {string} orgType
 * @param {string} token
 */
export function invitePathForToken(orgType, token) {
  const slug = portalSlugForOrgType(orgType);
  return `/${slug}/invite?token=${encodeURIComponent(token)}`;
}

/**
 * @param {string} orgType
 * @param {string} token
 */
export function inviteUrlForToken(orgType, token) {
  return `${webBaseUrl()}${invitePathForToken(orgType, token)}`;
}

/** @param {string} token */
export function passwordResetUrl(token) {
  return `${webBaseUrl()}/merchant/reset-password?token=${encodeURIComponent(token)}`;
}
