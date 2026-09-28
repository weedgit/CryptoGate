import { AlertSettingsPage } from "../shared/AlertSettingsPage";
import type { Session } from "./api";
import { primaryAgentOrgId } from "./org";
import { rerunAgentAlerts } from "./agentAlerts";
import {
  AGENT_NOTIFICATION_META,
  saveAgentNotificationPrefs,
} from "./agentNotificationPrefs";
import { getNotificationPreferences } from "../merchant/api";

type Props = { session: Session };

/** Alerts tab (agent portal): each member's own email / in-app choices. */
export function AgentNotificationSettingsPage({ session }: Props) {
  return (
    <AlertSettingsPage
      orgId={primaryAgentOrgId(session)}
      events={AGENT_NOTIFICATION_META}
      load={getNotificationPreferences}
      save={saveAgentNotificationPrefs}
      onSaved={() => rerunAgentAlerts()}
      noOrgMessage="No agent organization is available for this account."
    />
  );
}
