import type { Session } from "../merchant/api";

/**
 * Live actions unlock after contact + org profile (name, country) + wallet,
 * and (for merchants) activation fee paid.
 * Missing setupReady (older API) falls back to contactVerified; missing both → unlocked.
 */
export function sessionLiveActionsUnlocked(session: Session): boolean {
  if (typeof session.setupReady === "boolean") {
    if (!session.setupReady) return false;
    if (typeof session.activationPaid === "boolean") {
      return session.activationPaid;
    }
    return true;
  }
  if (typeof session.contactVerified === "boolean") return session.contactVerified;
  return true;
}

/** True when contact/profile/wallet setup is incomplete (not activation). */
export function sessionNeedsOrgSetup(session: Session): boolean {
  if (typeof session.setupReady === "boolean") return session.setupReady === false;
  if (typeof session.contactVerified === "boolean") {
    return session.contactVerified === false;
  }
  return false;
}

/** Merchant setup done but activation fee unpaid. */
export function sessionNeedsActivationPayment(session: Session): boolean {
  return (
    session.setupReady === true &&
    typeof session.activationPaid === "boolean" &&
    session.activationPaid === false
  );
}

/** @deprecated use sessionNeedsOrgSetup */
export function sessionNeedsContactVerification(session: Session): boolean {
  return sessionNeedsOrgSetup(session);
}

export const LIVE_ACTION_LOCKED_HINT =
  "Finish account setup (email, phone, name, org profile, and wallet) before this action";

export const ACTIVATION_PAYMENT_LOCKED_HINT =
  "Pay the account activation fee before using merchant features";

export function liveActionLockedHint(session: Session): string {
  if (sessionNeedsActivationPayment(session)) {
    return ACTIVATION_PAYMENT_LOCKED_HINT;
  }
  return LIVE_ACTION_LOCKED_HINT;
}
