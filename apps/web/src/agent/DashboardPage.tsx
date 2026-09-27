import { useMemo } from "react";
import { agentRoute } from "../shared/portalRouting";
import { DashboardPage as PlatformDashboardPage } from "../platform/DashboardPage";
import {
  DashboardPortalContext,
  type DashboardPortal,
} from "../platform/dashboardPortal";
import type { OrgAccount } from "../platform/api";
import { getAgentCommission, type Session } from "./api";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import { orgsInAgentSubtree } from "./agentSubtree";
import { primaryAgentOrgId, sessionIsAgentViewerOnly } from "./org";

type Props = { session: Session };

/** Agent dashboard — Platform dashboard layout scoped to this agent's subtree. */
export function DashboardPage({ session }: Props) {
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const readOnly = useMemo(() => sessionIsAgentViewerOnly(session), [session]);

  const portal = useMemo((): DashboardPortal => {
    const scopeOrgs = (orgs: OrgAccount[] | null): OrgAccount[] | null => {
      if (!orgs) return null;
      return agentId ? orgsInAgentSubtree(agentId, orgs) : [];
    };

    return {
      kind: "agent",
      route: agentRoute,
      eyebrow: "Agent portal",
      titleOrgId: agentId,
      title: "Agent",
      readOnly,
      overviewStorageKey: "paymentgate.agent.overviewCharts.v1",
      scopeOrgId: agentId,
      peekOrgs: () => scopeOrgs(peekAgentOrgs()),
      getOrgs: async (opts) => scopeOrgs(await getAgentOrgs(opts)) ?? [],
      getCommissionPercent: async () =>
        agentId
          ? ((await getAgentCommission(agentId)).commissionPercent?.trim() || null)
          : null,
    };
  }, [agentId, readOnly]);

  return (
    <DashboardPortalContext.Provider value={portal}>
      <PlatformDashboardPage session={session} />
    </DashboardPortalContext.Provider>
  );
}
