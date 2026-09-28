import { useMemo } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { sessionLiveActionsUnlocked } from "../auth/contactVerification";
import { AccountsPage } from "../platform/ArchitecturePage";
import {
  AccountsPortalContext,
  type AccountsPortal,
  type AccountsPortalNode,
} from "../platform/accountsPortal";
import type { OrgAccount } from "../platform/api";
import { listOrgMemberEmails, listOrgUsers, type Session } from "./api";
import { CreateSiteModal } from "./CreateSiteModal";
import {
  MERCHANT_ORGS_UPDATED_EVENT,
  getMerchantOrgs,
  peekMerchantOrgs,
  refreshMerchantOrgList,
  removeMerchantOrgFromList,
} from "./merchantOrgList";
import {
  parentMerchantOrgId,
  sessionCanManageSites,
  sessionRoleOnOrg,
  sitesInMerchantSubtree,
} from "./org";

type Props = {
  session: Session;
};

const MANAGE_ROLES = new Set(["owner", "administrator"]);

/** Accounts paths map onto the merchant Sites area. */
function merchantAccountsRoute(path = ""): string {
  if (path === "accounts") return merchantRoute("sites");
  if (path.startsWith("accounts/")) {
    return merchantRoute(`sites/${path.slice("accounts/".length)}`);
  }
  return merchantRoute(path);
}

function useMerchantAccountsPortal(session: Session): AccountsPortal {
  const merchantId = useMemo(() => parentMerchantOrgId(session), [session]);

  return useMemo((): AccountsPortal => {
    const scopeOrgs = (orgs: OrgAccount[]) => {
      if (!merchantId) return [];
      const root = orgs.find((o) => o.id === merchantId);
      const ids = new Set(sitesInMerchantSubtree(orgs, merchantId).map((o) => o.id));
      return [...(root ? [root] : []), ...orgs.filter((o) => ids.has(o.id))];
    };
    const orgById = () =>
      new Map<string, AccountsPortalNode>(
        ((peekMerchantOrgs() ?? []) as OrgAccount[]).map((o) => [o.id, o]),
      );
    /**
     * Direct role on the node, else the nearest Owner/Admin role on a parent
     * merchant or site (mirrors the API's effective role; never above the merchant).
     */
    const effectiveRole = (node: AccountsPortalNode, skipSelf = false): string | null => {
      if (!skipSelf) {
        const direct = sessionRoleOnOrg(session, node.id);
        if (direct || node.type !== "merchant_site") return direct;
      } else if (node.type !== "merchant_site") {
        return null;
      }
      const byId = orgById();
      const seen = new Set<string>();
      let currentId = node.parentId;
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const row = byId.get(currentId);
        if (!row || (row.type !== "merchant" && row.type !== "merchant_site")) break;
        const role = sessionRoleOnOrg(session, currentId);
        if (role && MANAGE_ROLES.has(role)) return role;
        if (row.type === "merchant") break;
        currentId = row.parentId;
      }
      return null;
    };
    const canManage = (node: AccountsPortalNode) => {
      const role = effectiveRole(node);
      return Boolean(role && MANAGE_ROLES.has(role));
    };
    const isMerchantNode = (node: AccountsPortalNode) =>
      node.type === "merchant" || node.type === "merchant_site";
    const manageSites = sessionCanManageSites(session);
    const liveOnboard = manageSites && sessionLiveActionsUnlocked(session);

    return {
      kind: "merchant",
      route: merchantAccountsRoute,
      auditHref: null,
      orgs: {
        get: () => getMerchantOrgs() as Promise<OrgAccount[]>,
        peek: () => peekMerchantOrgs() as OrgAccount[] | null,
        refresh: (opts) => refreshMerchantOrgList(opts) as Promise<OrgAccount[]>,
        remove: (orgId) => {
          removeMerchantOrgFromList(orgId);
        },
        updatedEvent: MERCHANT_ORGS_UPDATED_EVENT,
      },
      listMemberEmails: () => listOrgMemberEmails(),
      scopeOrgs,
      rootIds: new Set(merchantId ? [merchantId] : []),
      readOnly: !manageSites,
      canManageAny: manageSites,
      canOnboardUnder: (node) => liveOnboard && isMerchantNode(node) && canManage(node),
      canLifecycle: (node) => {
        if (node.type !== "merchant_site") return false;
        const role = effectiveRole(node, true);
        return Boolean(role && MANAGE_ROLES.has(role));
      },
      canEditProfile: (org) => isMerchantNode(org) && canManage(org),
      canEditAgentPayout: () => false,
      canManageTeam: (org) => isMerchantNode(org) && effectiveRole(org) === "owner",
      loadTeam: (orgId) => listOrgUsers(orgId),
    };
  }, [session, merchantId]);
}

/**
 * Merchant Sites — Platform's Accounts tree + detail cards scoped to this
 * merchant (merchant → sites, with cashiers in each detail's team). The create
 * modal overlays the tree so it does not unmount (`/merchant/sites/new`).
 */
export function MerchantSitesRoutes({ session }: Props) {
  const navigate = useNavigate();
  const portal = useMerchantAccountsPortal(session);
  const createMatch = useMatch({ path: merchantRoute("sites/new"), end: true });
  return (
    <AccountsPortalContext.Provider value={portal}>
      <AccountsPage session={session} />
      {createMatch ? (
        <CreateSiteModal
          session={session}
          onClose={() => navigate(merchantRoute("sites"))}
        />
      ) : null}
    </AccountsPortalContext.Provider>
  );
}
