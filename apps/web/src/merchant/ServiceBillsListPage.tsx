import { ServiceBillsListPage as PlatformServiceBillsListPage } from "../platform/ServiceBillsListPage";
import { ServiceBillsPortalContext } from "../platform/serviceBillsPortal";
import type { Session } from "./api";
import { useMerchantServiceBillsPortal } from "./useMerchantServiceBillsPortal";

type Props = { session: Session };

/** D5 — Platform service bill list, scoped by the server to this merchant. */
export function ServiceBillsListPage({ session }: Props) {
  const portal = useMerchantServiceBillsPortal(session, { withPlan: true });
  return (
    <ServiceBillsPortalContext.Provider value={portal}>
      <PlatformServiceBillsListPage session={session} />
    </ServiceBillsPortalContext.Provider>
  );
}
