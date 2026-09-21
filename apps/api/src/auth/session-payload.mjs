import { normalizeSessionTimeoutMinutes } from "../http/session-ttl.mjs";
import { loadOrgSetupStatus } from "./org-setup.mjs";

/**
 * OpenAPI Session.
 * @param {{
 *   id: string,
 *   email: string,
 *   mustChangePassword?: boolean,
 *   mfaEnrolled?: boolean,
 *   mfaEnrollmentPending?: boolean,
 *   displayName?: string | null,
 *   avatarUrl?: string | null,
 *   locale?: string | null,
 *   timezone?: string | null,
 *   mfaEnforcement?: boolean,
 *   sessionTimeoutMinutes?: number,
 *   emailVerified?: boolean,
 *   phone?: string | null,
 *   phoneVerified?: boolean,
 * }} user
 * @param {{ orgId: string, userId: string, role: string, orgType: string }[]} [memberships]
 */
export function sessionFromUser(user, memberships = []) {
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    locale: user.locale || "en",
    timezone: user.timezone || "UTC",
    mustChangePassword: user.mustChangePassword === true,
    emailVerified: user.emailVerified === true,
    phone: user.phone ?? null,
    phoneVerified: user.phoneVerified === true,
    contactVerified: user.emailVerified === true && user.phoneVerified === true,
    mfaEnrolled: user.mfaEnrolled === true,
    mfaEnrollmentPending: user.mfaEnrollmentPending === true,
    mfaEnforcement: user.mfaEnforcement === true,
    sessionTimeoutMinutes: normalizeSessionTimeoutMinutes(
      user.sessionTimeoutMinutes,
    ),
    memberships,
  };
}

/**
 * Session plus org setup readiness (contact + profile + wallet).
 * @param {Parameters<typeof sessionFromUser>[0]} user
 * @param {Parameters<typeof sessionFromUser>[1]} [memberships]
 */
export async function sessionFromUserWithSetup(user, memberships = []) {
  const base = sessionFromUser(user, memberships);
  const setup = await loadOrgSetupStatus(memberships, user);
  return {
    ...base,
    contactVerified: setup.contactVerified,
    profileComplete: setup.profileComplete,
    walletSet: setup.walletSet,
    setupReady: setup.setupReady,
    setupOrgId: setup.setupOrgId,
  };
}
