import { createContext, useContext } from "react";
import type { OrgAccount, OrgMember, PlatformOrgMemberEmailRow } from "./api";

export type AccountsPortalNode = {
  id: string;
  type: string;
  parentId: string | null;
};

/**
 * Non-platform host for the Accounts page and its detail cards (Agent portal).
 * When no provider is mounted, every consumer keeps its Platform behaviour.
 */
export type AccountsPortal = {
  kind: "agent";
  route: (path?: string) => string;
  /** Audit log page, or null when the portal has none (links are hidden). */
  auditHref: string | null;
  orgs: {
    get: () => Promise<OrgAccount[]>;
    peek: () => OrgAccount[] | null;
    refresh: (opts?: { excludeOrgIds?: string[] }) => Promise<OrgAccount[]>;
    remove: (orgId: string) => void;
    updatedEvent: string;
  };
  listMemberEmails: () => Promise<PlatformOrgMemberEmailRow[]>;
  /** Orgs visible in this portal's tree. */
  scopeOrgs: (orgs: OrgAccount[]) => OrgAccount[];
  /** Tree roots that are expected to have no visible parent. */
  rootIds: ReadonlySet<string>;
  readOnly: boolean;
  /** True when the session may run any add / pause / delete action. */
  canManageAny: boolean;
  canOnboardUnder: (node: AccountsPortalNode) => boolean;
  canLifecycle: (node: AccountsPortalNode) => boolean;
  canEditProfile: (org: AccountsPortalNode) => boolean;
  canEditAgentPayout: (org: AccountsPortalNode) => boolean;
  canManageTeam: (org: AccountsPortalNode) => boolean;
  /** Team roster when the org overview omits it (no direct membership). */
  loadTeam: (orgId: string) => Promise<OrgMember[]>;
};

export const AccountsPortalContext = createContext<AccountsPortal | null>(null);

export function useAccountsPortal(): AccountsPortal | null {
  return useContext(AccountsPortalContext);
}
