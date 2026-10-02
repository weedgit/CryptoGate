import { normalizeSessionTimeoutMinutes } from "../http/session-ttl.mjs";
import { mustEnrollMfa } from "../orgs/role-policy.mjs";
import { resolveBusinessTimezone } from "../orgs/org-store.mjs";
import { loadOrgSetupStatus } from "./org-setup.mjs";

/**
 * Most-specific membership org for business-timezone resolution
 * (site → merchant → agent → platform).
 * @param {{ orgId: string, orgType?: string | null }[]} memberships
 * @returns {string | null}
 */
function primaryTimezoneOrgId(memberships) {
  const list = Array.isArray(memberships) ? memberships : [];
  const pick = (type) => list.find((m) => m.orgType === type)?.orgId ?? null;
  return (
    pick("merchant_site") ||
    pick("merchant") ||
    pick("agent_sub") ||
    pick("agent") ||
    pick("platform") ||
    null
  );
}

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
 *   timezoneConfirmed?: boolean,
 *   sessionTimeoutMinutes?: number,
 *   emailVerified?: boolean,
 *   phone?: string | null,
 *   phoneVerified?: boolean,
 * }} user
 * @param {{ orgId: string, userId: string, role: string, orgType: string }[]} [memberships]
 * @param {string | null} [businessTimezone]
 */
export function sessionFromUser(user, memberships = [], businessTimezone = null) {
  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    locale: user.locale || "en",
    /** @deprecated Prefer businessTimezone; kept for older clients. */
    timezone: businessTimezone || user.timezone || "UTC",
    /** @deprecated Always true when businessTimezone is set. */
    timezoneConfirmed: Boolean(businessTimezone) || user.timezoneConfirmed === true,
    businessTimezone: businessTimezone || null,
    mustChangePassword: user.mustChangePassword === true,
    emailVerified: user.emailVerified === true,
    phone: user.phone ?? null,
    phoneVerified: user.phoneVerified === true,
    contactVerified: user.emailVerified === true && user.phoneVerified === true,
    mfaEnrolled: user.mfaEnrolled === true,
    mfaEnrollmentPending: user.mfaEnrollmentPending === true,
    /** Business-Model §25: forced enroll for Platform/Merchant O/A only. */
    mfaEnforcement: mustEnrollMfa(memberships),
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
  const orgId = primaryTimezoneOrgId(memberships);
  const businessTimezone = orgId
    ? await resolveBusinessTimezone(orgId).catch(() => null)
    : null;
  const base = sessionFromUser(user, memberships, businessTimezone);
  const setup = await loadOrgSetupStatus(memberships, user);
  /** @type {boolean | undefined} */
  let activationPaid;
  if (setup.setupOrgType === "merchant" && setup.setupOrgId) {
    const { merchantHasBillingAnchor } = await import(
      "../commercial/merchant-commercial-store.mjs"
    );
    activationPaid = await merchantHasBillingAnchor(setup.setupOrgId);
  }
  return {
    ...base,
    contactVerified: setup.contactVerified,
    personComplete: setup.personComplete,
    profileComplete: setup.profileComplete,
    walletSet: setup.walletSet,
    setupReady: setup.setupReady,
    setupOrgId: setup.setupOrgId,
    ...(activationPaid !== undefined ? { activationPaid } : {}),
  };
}
