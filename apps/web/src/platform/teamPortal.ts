import { createContext, useContext, type ReactNode } from "react";
import type { OrgRef } from "../shared/registeredEmails";

/** Non-platform scope for the Platform team page (Agent portal). */
export type TeamPortal = {
  kind: "agent";
  orgType: "agent";
  orgId: string | null;
  /** Lower-case noun used in copy, e.g. "agent" → "Fetching agent org members." */
  orgLabel: string;
  canManage: boolean;
  /** Why invites are locked (e.g. unverified contact); null when unlocked. */
  inviteLockedHint: string | null;
  header?: ReactNode;
  peekOrgs: () => OrgRef[] | null;
  getOrgs: () => Promise<OrgRef[]>;
};

export const TeamPortalContext = createContext<TeamPortal | null>(null);

export function useTeamPortal(): TeamPortal | null {
  return useContext(TeamPortalContext);
}
