import { useMemo } from "react";
import type { CommissionsPortal } from "../platform/commissionsPortal";
import { agentRoute } from "../shared/portalRouting";
import type { Session } from "./api";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import {
  primaryAgentOrgId,
  sessionCanOnboardMerchant,
  sessionIsAgentViewerOnly,
} from "./org";

export function useAgentCommissionsPortal(session: Session): CommissionsPortal {
  return useMemo(
    () => ({
      kind: "agent",
      route: agentRoute,
      payeeOrgId: primaryAgentOrgId(session),
      readOnly: sessionIsAgentViewerOnly(session),
      canConfirmReceipt: sessionCanOnboardMerchant(session),
      peekOrgs: peekAgentOrgs,
      getOrgs: () => getAgentOrgs(),
    }),
    [session],
  );
}
