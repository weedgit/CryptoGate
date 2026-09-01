import { normalizeSessionTimeoutMinutes } from "../http/session-ttl.mjs";

/**
 * OpenAPI Session.
 * @param {{
 *   id: string,
 *   email: string,
 *   mustChangePassword?: boolean,
 *   mfaEnrolled?: boolean,
 *   mfaEnrollmentPending?: boolean,
 *   displayName?: string | null,
 *   locale?: string | null,
 *   timezone?: string | null,
 *   mfaEnforcement?: boolean,
 *   sessionTimeoutMinutes?: number,
 * }} user
 * @param {{ orgId: string, userId: string, role: string, orgType: string }[]} [memberships]
 */
export function sessionFromUser(user, memberships = []) {
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    locale: user.locale || "en",
    timezone: user.timezone || "UTC",
    mustChangePassword: user.mustChangePassword === true,
    mfaEnrolled: user.mfaEnrolled === true,
    mfaEnrollmentPending: user.mfaEnrollmentPending === true,
    mfaEnforcement: user.mfaEnforcement === true,
    sessionTimeoutMinutes: normalizeSessionTimeoutMinutes(
      user.sessionTimeoutMinutes,
    ),
    memberships,
  };
}
