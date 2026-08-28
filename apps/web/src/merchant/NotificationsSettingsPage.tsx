import type { Session } from "./api";
import { sessionCanEditOrgSettings } from "./org";

const NOTIFICATION_ROWS = [
  "Payment completed",
  "Payment anomaly",
  "Settlement address change / activation",
  "xPub change",
  "Webhook delivery failures",
  "Service bill issued / overdue",
  "Site override requests (parent Owner)",
] as const;

type Props = { session: Session };

export function NotificationsSettingsPage({ session }: Props) {
  const canEdit = sessionCanEditOrgSettings(session);

  return (
    <div className="plat-settings plat-settings--merchant">
      <div className="plat-settings__grid plat-settings__grid--single">
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Notification preferences</h2>
            {!canEdit ? (
              <span className="plat-settings__badge">Viewer · read-only</span>
            ) : null}
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Choose email and in-app delivery per event type. The alerts bell (A9) shows
              operational items that need attention; preferences here control outbound
              email when the notification API ships.
            </p>
            <ul className="plat-settings__pref-list" aria-disabled>
              {NOTIFICATION_ROWS.map((label) => (
                <li key={label}>
                  <label>
                    <input type="checkbox" disabled defaultChecked readOnly />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
            <p className="plat-settings__card-note">
              Saving will enable when notification preference endpoints land.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
