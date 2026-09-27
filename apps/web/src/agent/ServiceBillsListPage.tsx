import { ServiceBillsListPage as PlatformServiceBillsListPage } from "../platform/ServiceBillsListPage";
import { ServiceBillsPortalContext } from "../platform/serviceBillsPortal";
import type { Session } from "./api";
import { AGENT_SERVICE_BILLS_PORTAL } from "./agentServiceBillsPortal";

type Props = { session: Session };

/** Agent service bills — Platform list, read-only and scoped by the server to this agent. */
export function ServiceBillsListPage({ session }: Props) {
  return (
    <ServiceBillsPortalContext.Provider value={AGENT_SERVICE_BILLS_PORTAL}>
      <PlatformServiceBillsListPage session={session} />
    </ServiceBillsPortalContext.Provider>
  );
}
