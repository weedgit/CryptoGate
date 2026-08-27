import type { Session } from "../merchant/api";

const MFA_ENROLL_ROLES = new Set(["owner", "administrator"]);

/** Matches API `canEnrollMfa` — Owner / Administrator on any org. */
export function sessionCanEnrollMfa(session: Session): boolean {
  return session.memberships.some((m) => MFA_ENROLL_ROLES.has(m.role));
}

/**
 * Phase 1: Owner and Administrator must enroll MFA (A5 / project plan).
 * Viewers and Cashiers are not forced.
 */
export function sessionNeedsForcedMfa(session: Session): boolean {
  if (session.mfaEnrolled === true) return false;
  return sessionCanEnrollMfa(session);
}
