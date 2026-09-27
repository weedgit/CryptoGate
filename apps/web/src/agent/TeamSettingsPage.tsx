import { useMemo } from "react";
import { PlatformTeamPage } from "../platform/PlatformTeamPage";
import { TeamPortalContext, type TeamPortal } from "../platform/teamPortal";
import {
  liveActionLockedHint,
  sessionLiveActionsUnlocked,
} from "../auth/contactVerification";
import { SetupChecklistCard } from "../auth/SetupChecklistCard";
import type { Session } from "./api";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import { primaryAgentOrgId, sessionCanManageTeam } from "./org";

type Props = { session: Session };

/** Agent team — Platform team roster for this agent org (Owner manages). */
export function TeamSettingsPage({ session }: Props) {
  const portal = useMemo(
    (): TeamPortal => ({
      kind: "agent",
      orgType: "agent",
      orgId: primaryAgentOrgId(session),
      orgLabel: "agent",
      canManage: sessionCanManageTeam(session),
      inviteLockedHint: sessionLiveActionsUnlocked(session)
        ? null
        : liveActionLockedHint(session),
      header: <SetupChecklistCard session={session} portal="agent" />,
      peekOrgs: peekAgentOrgs,
      getOrgs: () => getAgentOrgs(),
    }),
    [session],
  );

  return (
    <TeamPortalContext.Provider value={portal}>
      <PlatformTeamPage session={session} />
    </TeamPortalContext.Provider>
  );
}
