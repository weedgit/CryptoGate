import type { Session } from "../merchant/api";

const MFA_ENROLL_ROLES = new Set(["owner", "administrator"]);

/** Matches API `canEnrollMfa` — Owner / Administrator on any org. */
export function sessionCanEnrollMfa(session: Session): boolean {
  return session.memberships.some((m) => MFA_ENROLL_ROLES.has(m.role));
}

/**
 * When the user opts into MFA enforcement, Owner/Administrator must enroll.
 * Default is off (user preference).
 */
export function sessionNeedsForcedMfa(session: Session): boolean {
  if (session.mfaEnforcement !== true) return false;
  if (session.mfaEnrolled === true) return false;
  return sessionCanEnrollMfa(session);
}
