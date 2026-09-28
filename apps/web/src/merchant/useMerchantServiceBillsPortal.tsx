import { useMemo } from "react";
import type { ServiceBillsPortal } from "../platform/serviceBillsPortal";
import { merchantRoute } from "../shared/portalRouting";
import { getServiceBillCheckout, type Session } from "./api";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import { primaryMerchantOrgId, sessionCanCheckoutServiceBill } from "./org";

/** Merchant host for the Platform service bill detail page: own bills, pay via checkout. */
export function useMerchantServiceBillsPortal(session: Session): ServiceBillsPortal {
  const canPay = sessionCanCheckoutServiceBill(session);
  const homeOrgId = primaryMerchantOrgId(session);
  return useMemo(
    () => ({
      kind: "merchant",
      route: merchantRoute,
      peekOrgs: peekMerchantOrgs,
      getOrgs: () => getMerchantOrgs(),
      subtitle: "Platform software fees and your one-time activation fee.",
      searchPlaceholder: "Search bill ID, period, or amount...",
      orgHref: (orgId) =>
        orgId === homeOrgId ? null : merchantRoute(`sites/${orgId}`),
      loadCheckout: canPay ? (billId) => getServiceBillCheckout(billId) : undefined,
    }),
    [canPay, homeOrgId],
  );
}
