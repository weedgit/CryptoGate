import { ServiceBillDetailPage as PlatformServiceBillDetailPage } from "../platform/ServiceBillDetailPage";
import { ServiceBillsPortalContext } from "../platform/serviceBillsPortal";
import type { Session } from "./api";
import { useMerchantServiceBillsPortal } from "./useMerchantServiceBillsPortal";

type Props = { session: Session };

/** D6 — Platform bill detail + invoice face with the merchant's remittance checkout. */
export function ServiceBillDetailPage({ session }: Props) {
  const portal = useMerchantServiceBillsPortal(session);
  return (
    <ServiceBillsPortalContext.Provider value={portal}>
      <PlatformServiceBillDetailPage session={session} />
    </ServiceBillsPortalContext.Provider>
  );
}
