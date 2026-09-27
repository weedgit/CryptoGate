import { ServiceBillDetailPage as PlatformServiceBillDetailPage } from "../platform/ServiceBillDetailPage";
import { ServiceBillsPortalContext } from "../platform/serviceBillsPortal";
import type { Session } from "./api";
import { AGENT_SERVICE_BILLS_PORTAL } from "./agentServiceBillsPortal";

type Props = { session: Session };

/** Agent service bill detail — Platform invoice view without issue / mark paid / void. */
export function ServiceBillDetailPage({ session }: Props) {
  return (
    <ServiceBillsPortalContext.Provider value={AGENT_SERVICE_BILLS_PORTAL}>
      <PlatformServiceBillDetailPage session={session} />
    </ServiceBillsPortalContext.Provider>
  );
}
