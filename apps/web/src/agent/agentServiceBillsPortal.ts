import type { ServiceBillsPortal } from "../platform/serviceBillsPortal";
import { agentRoute } from "../shared/portalRouting";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";

export const AGENT_SERVICE_BILLS_PORTAL: ServiceBillsPortal = {
  kind: "agent",
  route: agentRoute,
  peekOrgs: peekAgentOrgs,
  getOrgs: () => getAgentOrgs(),
};
