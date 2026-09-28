import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PlatformTeamPage } from "../platform/PlatformTeamPage";
import { TeamPortalContext, type TeamPortal } from "../platform/teamPortal";
import {
  liveActionLockedHint,
  sessionLiveActionsUnlocked,
} from "../auth/contactVerification";
import { ORG_EDIT_PARAM, withEditParam } from "../shared/modalLinks";
import type { Session } from "./api";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import { primaryAgentOrgId, sessionCanManageTeam } from "./org";

type Props = { session: Session };

/** Agent team — Platform team roster for this agent org (Owner manages). */
export function TeamSettingsPage({ session }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
      actions: (
        <button
          type="button"
          className="btn-primary plat-bills__action-btn plat-team__invite-cta"
          onClick={() => navigate(withEditParam(pathname, ORG_EDIT_PARAM))}
        >
          <svg
            className="plat-team__settings-cta-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
            <circle cx="15" cy="6" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="17" cy="18" r="2" />
          </svg>
          Settings
        </button>
      ),
      peekOrgs: peekAgentOrgs,
      getOrgs: () => getAgentOrgs(),
    }),
    [session, navigate, pathname],
  );

  return (
    <TeamPortalContext.Provider value={portal}>
      <PlatformTeamPage session={session} />
    </TeamPortalContext.Provider>
  );
}
