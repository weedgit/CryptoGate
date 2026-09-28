import { AlertSettingsPage } from "../shared/AlertSettingsPage";
import { getNotificationPreferences } from "../merchant/api";
import type { Session } from "./api";
import {
  PLATFORM_NOTIFICATION_META,
  primaryPlatformOrgId,
  savePlatformNotificationPrefs,
} from "./platformNotificationPrefs";

type Props = { session: Session };

/** Alerts tab (platform portal): each member's own email / in-app choices. */
export function PlatformAlertsSettingsPage({ session }: Props) {
  return (
    <AlertSettingsPage
      orgId={primaryPlatformOrgId(session)}
      events={PLATFORM_NOTIFICATION_META}
      load={getNotificationPreferences}
      save={savePlatformNotificationPrefs}
      noOrgMessage="You are not a member of the platform organization."
    />
  );
}
