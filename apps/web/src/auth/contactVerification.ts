import type { Session } from "../merchant/api";

/**
 * Live actions unlock after contact + org profile (name, country) + wallet.
 * Missing setupReady (older API) falls back to contactVerified; missing both → unlocked.
 */
export function sessionLiveActionsUnlocked(session: Session): boolean {
  if (typeof session.setupReady === "boolean") return session.setupReady;
  if (typeof session.contactVerified === "boolean") return session.contactVerified;
  return true;
}

export function sessionNeedsOrgSetup(session: Session): boolean {
  return sessionLiveActionsUnlocked(session) === false;
}

/** @deprecated use sessionNeedsOrgSetup */
export function sessionNeedsContactVerification(session: Session): boolean {
  return sessionNeedsOrgSetup(session);
}

export const LIVE_ACTION_LOCKED_HINT =
  "Finish account setup (email, phone, country, and wallet) before this action";
