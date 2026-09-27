import type { Session } from "../merchant/api";

const MFA_ENROLL_ROLES = new Set(["owner", "administrator"]);
/** Matches API `mustEnrollMfa` — fund-bearing orgs only. */
const MFA_REQUIRED_ORG_TYPES = new Set(["platform", "merchant"]);

/**
 * Matches API `canEnrollMfa` — Owner/Admin on platform, merchant, or agent
 * (agent may enroll for payout step-up). Not site O/A, Viewer, or Cashier.
 */
export function sessionCanEnrollMfa(session: Session): boolean {
  return session.memberships.some((m) => {
    if (!MFA_ENROLL_ROLES.has(m.role)) return false;
    if (m.orgType === "merchant_site") return false;
    return true;
  });
}

/**
 * Forced enroll + login TOTP: Platform or Merchant Owner/Administrator only.
 * Prefers API `mfaEnforcement` (Business-Model §25); falls back to memberships.
 */
export function sessionNeedsForcedMfa(session: Session): boolean {
  if (session.mfaEnrolled === true) return false;
  if (typeof session.mfaEnforcement === "boolean") {
    return session.mfaEnforcement === true;
  }
  return session.memberships.some(
    (m) =>
      MFA_ENROLL_ROLES.has(m.role) &&
      MFA_REQUIRED_ORG_TYPES.has(m.orgType ?? ""),
  );
}

/** True when the user has finished TOTP enrollment and can step up privileged actions. */
export function sessionMfaEnrolled(session: Session): boolean {
  return session.mfaEnrolled === true;
}
