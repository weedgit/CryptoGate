import { Suspense, lazy, useEffect, useMemo } from "react";
import { useMatch } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import { RouteErrorBoundary } from "../shared/RouteErrorBoundary";
import { loadLazyChunk } from "../shared/lazyChunkRecovery";
import { sessionLiveActionsUnlocked } from "../auth/contactVerification";
import { AccountsPage } from "../platform/ArchitecturePage";
import {
  AccountsPortalContext,
  type AccountsPortal,
  type AccountsPortalNode,
} from "../platform/accountsPortal";
import type { OrgAccount } from "../platform/api";
import { listOrgMemberEmails, listOrgUsers, type Session } from "./api";
import {
  AGENT_ORGS_UPDATED_EVENT,
  getAgentOrgs,
  peekAgentOrgs,
  refreshAgentOrgList,
  removeAgentOrgFromList,
} from "./agentOrgList";
import { orgsInAgentSubtree } from "./agentSubtree";
import {
  primaryAgentOrgId,
  sessionCanManageDirectChild,
  sessionCanManageOrgAsParent,
  sessionCanManageTeam,
  sessionCanOnboardMerchant,
  sessionIsAgentViewerOnly,
} from "./org";
import { RequireAgentOperator } from "./RequireAgentPortal";

const OnboardMerchantPage = lazy(() =>
  loadLazyChunk(() =>
    import("./OnboardMerchantPage").then((m) => ({
      default: m.OnboardMerchantPage,
    })),
  ),
);

const OnboardSitePage = lazy(() =>
  loadLazyChunk(() =>
    import("./OnboardSitePage").then((m) => ({
      default: m.OnboardSitePage,
    })),
  ),
);

type Props = {
  session: Session;
};

/** Billing merchant above a site (or the merchant itself). */
function billingMerchantOf(
  node: AccountsPortalNode,
  byId: ReadonlyMap<string, AccountsPortalNode>,
): AccountsPortalNode | null {
  let current: AccountsPortalNode | undefined = node;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.type === "merchant") return current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}

function useAgentAccountsPortal(session: Session): AccountsPortal {
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);

  return useMemo((): AccountsPortal => {
    const scopeOrgs = (orgs: OrgAccount[]) =>
      agentId ? orgsInAgentSubtree(agentId, orgs) : [];
    const orgById = () =>
      new Map<string, AccountsPortalNode>(
        (peekAgentOrgs() ?? []).map((o) => [o.id, o]),
      );
    const orgRefs = () =>
      (peekAgentOrgs() ?? []).map((o) => ({ id: o.id, parentId: o.parentId }));
    const liveOnboard =
      sessionCanOnboardMerchant(session) && sessionLiveActionsUnlocked(session);
    const isOwnAgent = (org: AccountsPortalNode) =>
      org.type === "agent" && sessionCanManageOrgAsParent(session, org.id);

    return {
      kind: "agent",
      route: agentRoute,
      auditHref: null,
      orgs: {
        get: () => getAgentOrgs(),
        peek: peekAgentOrgs,
        refresh: refreshAgentOrgList,
        remove: (orgId) => {
          removeAgentOrgFromList(orgId);
        },
        updatedEvent: AGENT_ORGS_UPDATED_EVENT,
      },
      listMemberEmails: () => listOrgMemberEmails(),
      scopeOrgs,
      rootIds: new Set(agentId ? [agentId] : []),
      readOnly: sessionIsAgentViewerOnly(session),
      canManageAny: sessionCanOnboardMerchant(session),
      canOnboardUnder: (node) => {
        if (!liveOnboard) return false;
        if (node.type === "agent") return isOwnAgent(node);
        if (node.type !== "merchant" && node.type !== "merchant_site") return false;
        const merchant = billingMerchantOf(node, orgById());
        return Boolean(
          merchant?.parentId &&
            sessionCanManageOrgAsParent(session, merchant.parentId),
        );
      },
      canLifecycle: (node) =>
        sessionCanManageDirectChild(session, node, orgRefs()),
      canEditProfile: isOwnAgent,
      canEditAgentPayout: isOwnAgent,
      canManageTeam: (org) =>
        org.type === "agent" &&
        org.id === agentId &&
        sessionCanManageTeam(session),
      loadTeam: (orgId) => listOrgUsers(orgId),
    };
  }, [session, agentId]);
}

/**
 * Agent Accounts — Platform's org tree + detail cards scoped to this agent.
 * Onboard wizards stay overlaid so the tree does not unmount.
 */
export function AgentAccountsRoutes({ session }: Props) {
  const portal = useAgentAccountsPortal(session);
  const merchantNew = useMatch({ path: agentRoute("merchants/new"), end: true });
  const siteNew = useMatch({ path: agentRoute("sites/new"), end: true });

  useEffect(() => {
    const t1 = window.setTimeout(() => void import("./OnboardMerchantPage"), 600);
    const t2 = window.setTimeout(() => void import("./OnboardSitePage"), 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <AccountsPortalContext.Provider value={portal}>
      <AccountsPage session={session} />
      {merchantNew ? (
        <RouteErrorBoundary>
          <Suspense
            fallback={
              <OnboardWizardLoading
                title="Onboard merchant"
                closeTo={agentRoute("accounts")}
              />
            }
          >
            <RequireAgentOperator session={session}>
              <OnboardMerchantPage session={session} />
            </RequireAgentOperator>
          </Suspense>
        </RouteErrorBoundary>
      ) : null}
      {siteNew ? (
        <RouteErrorBoundary>
          <Suspense
            fallback={
              <OnboardWizardLoading
                title="New site"
                closeTo={agentRoute("accounts")}
              />
            }
          >
            <RequireAgentOperator session={session}>
              <OnboardSitePage session={session} />
            </RequireAgentOperator>
          </Suspense>
        </RouteErrorBoundary>
      ) : null}
    </AccountsPortalContext.Provider>
  );
}
