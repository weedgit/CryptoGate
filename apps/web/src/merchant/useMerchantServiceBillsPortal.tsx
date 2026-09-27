import { useMemo } from "react";
import type { ServiceBillsPortal } from "../platform/serviceBillsPortal";
import { merchantRoute } from "../shared/portalRouting";
import { getServiceBillCheckout, type Session } from "./api";
import { MerchantBillingPlanCard } from "./MerchantBillingPlanCard";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import { primaryMerchantOrgId, sessionCanCheckoutServiceBill } from "./org";

/** Merchant host for the Platform service bill pages: own bills, pay via checkout. */
export function useMerchantServiceBillsPortal(
  session: Session,
  opts: { withPlan?: boolean } = {},
): ServiceBillsPortal {
  const canPay = sessionCanCheckoutServiceBill(session);
  const homeOrgId = primaryMerchantOrgId(session);
  const withPlan = opts.withPlan ?? false;
  return useMemo(
    () => ({
      kind: "merchant",
      route: merchantRoute,
      peekOrgs: peekMerchantOrgs,
      getOrgs: () => getMerchantOrgs(),
      subtitle: "Platform software fees and your one-time activation fee.",
      searchPlaceholder: "Search bill ID, period, or amount...",
      header: withPlan ? <MerchantBillingPlanCard session={session} /> : undefined,
      orgHref: (orgId) =>
        orgId === homeOrgId ? null : merchantRoute(`sites/${orgId}`),
      loadCheckout: canPay ? (billId) => getServiceBillCheckout(billId) : undefined,
    }),
    [session, canPay, homeOrgId, withPlan],
  );
}
