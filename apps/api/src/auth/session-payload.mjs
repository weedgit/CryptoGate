/**
 * OpenAPI Session.
 * @param {{
 *   id: string,
 *   email: string,
 *   mustChangePassword?: boolean,
 *   mfaEnrolled?: boolean,
 *   displayName?: string | null,
 *   locale?: string | null,
 *   timezone?: string | null,
 *   mfaEnforcement?: boolean,
 *   sessionTimeoutMinutes?: number,
 * }} user
 * @param {{ orgId: string, userId: string, role: string, orgType: string }[]} [memberships]
 */
export function sessionFromUser(user, memberships = []) {
  const timeout = Number(user.sessionTimeoutMinutes);
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    locale: user.locale || "en",
    timezone: user.timezone || "UTC",
    mustChangePassword: user.mustChangePassword === true,
    mfaEnrolled: user.mfaEnrolled === true,
    mfaEnforcement: user.mfaEnforcement === true,
    sessionTimeoutMinutes:
      timeout === 15 || timeout === 30 || timeout === 60 || timeout === 120
        ? timeout
        : 30,
    memberships,
  };
}
