import type { Session } from "./api";
import { sessionIsCashierOnly, sessionLocationKind } from "./org";

/**
 * Which home, shell, and route table a merchant-portal session gets.
 * merchant — HQ back office; site — location back office; cashier — terminal.
 */
export type MerchantExperience = "merchant" | "site" | "cashier";

export function resolveMerchantExperience(session: Session): MerchantExperience {
  if (sessionIsCashierOnly(session)) return "cashier";
  return sessionLocationKind(session) === "site" ? "site" : "merchant";
}

/** Service bills are issued to merchant orgs only (API rejects sites). */
export function experienceShowsServiceBills(experience: MerchantExperience): boolean {
  return experience === "merchant";
}
