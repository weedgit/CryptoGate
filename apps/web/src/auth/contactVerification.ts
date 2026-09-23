import type { Session } from "../merchant/api";
import { agentRoute, merchantRoute } from "../shared/portalRouting";

/**
 * Live actions unlock after contact + org profile (name, billing email,
 * merchant country) + wallet, and (for merchants) activation fee paid.
 * Until then the portal is Watch-only. Missing setupReady (older API) falls
 * back to contactVerified; missing both → unlocked.
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

export type SetupChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  href: string | null;
  cta: string;
};

function contactDone(session: Session): boolean {
  return session.emailVerified === true && session.phoneVerified === true;
}

function personDone(session: Session): boolean {
  if (session.personComplete === true) return true;
  return (
    Boolean(session.firstName?.trim()) &&
    Boolean(session.lastName?.trim()) &&
    Boolean(session.timezone?.trim())
  );
}

function profileDone(session: Session): boolean {
  return session.profileComplete !== false;
}

function walletDone(session: Session): boolean {
  return session.walletSet !== false;
}

/** Discrete setup steps for banner / settings checklist (agent vs merchant). */
export function setupChecklistItems(
  session: Session,
  portal: "agent" | "merchant",
): SetupChecklistItem[] {
  const personPath =
    portal === "agent"
      ? agentRoute("settings")
      : merchantRoute("settings/security");
  const profilePath =
    portal === "agent"
      ? agentRoute("settings")
      : merchantRoute("settings/team");
  const walletPath =
    portal === "agent"
      ? agentRoute("settings")
      : merchantRoute("settings/settlement");
  const contactPath = personPath;

  return [
    {
      id: "contact",
      label: "Email & phone verified",
      done: contactDone(session),
      href: contactPath,
      cta: "Verify contacts",
    },
    {
      id: "person",
      label: "First name, last name, timezone",
      done: personDone(session),
      href: personPath,
      cta: "Open profile",
    },
    {
      id: "org",
      label:
        portal === "merchant"
          ? "Business name, country, billing email"
          : "Business name & billing email",
      done: profileDone(session),
      href: profilePath,
      cta: "Open org settings",
    },
    {
      id: "wallet",
      label:
        portal === "agent"
          ? "Commission payout wallet"
          : "Settlement wallet",
      done: walletDone(session),
      href: walletPath,
      cta: "Open wallet settings",
    },
  ];
}

/** Human-readable incomplete parts for the shell banner. */
export function missingSetupPartsLabel(
  session: Session,
  portal: "agent" | "merchant",
): string {
  const incomplete = setupChecklistItems(session, portal)
    .filter((i) => !i.done)
    .map((i) => {
      if (i.id === "contact") {
        if (session.emailVerified === true) return "phone";
        if (session.phoneVerified === true) return "email";
        return "email and phone";
      }
      if (i.id === "person") return "name / timezone";
      if (i.id === "org") {
        return portal === "merchant"
          ? "org profile (billing / country)"
          : "org profile (billing email)";
      }
      if (i.id === "wallet") {
        return portal === "agent" ? "payout wallet" : "settlement wallet";
      }
      return i.label;
    });
  if (incomplete.length === 0) return "account setup";
  return incomplete.join(", ");
}
