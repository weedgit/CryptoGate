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
    <div className="settings-page">
      <div className="settings-header">
        <p className="muted" style={{ margin: 0 }}>
          Email and in-app alerts for privileged and payment events.
        </p>
      </div>

      {!canEdit ? (
        <p className="muted">Viewer access — preferences are read-only when available.</p>
      ) : null}

      <div className="panel settings-panel">
        <h2>Notification preferences</h2>
        <p className="muted settings-note">
          Preference storage is not on the API yet. Toggles below show Phase 1 scope;
          saving will enable when Andrew lands notification prefs endpoints.
        </p>
        <div className="notification-list">
          {NOTIFICATION_ROWS.map((label) => (
            <label key={label} className="notification-row">
              <span>{label}</span>
              <input type="checkbox" disabled defaultChecked />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
