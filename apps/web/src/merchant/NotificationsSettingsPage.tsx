import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getNotificationPreferences,
  putNotificationPreferences,
  type NotificationPreference,
  type Session,
} from "./api";
import { AuthToast } from "../auth/AuthToast";
import {
  primaryMerchantOrgId,
  sessionCanEditOrgSettings,
} from "./org";

const NOTIFICATION_META: Record<
  string,
  { label: string; blurb: string }
> = {
  payment_completed: {
    label: "Payment completed",
    blurb: "Order reaches Completed after required confirmations.",
  },
  payment_anomaly: {
    label: "Payment anomaly",
    blurb: "Underpay, overpay, collision, or wrong-network cases.",
  },
  settlement_address: {
    label: "Settlement address change",
    blurb: "Pending cool-down and activation alerts.",
  },
  xpub_change: {
    label: "xPub change",
    blurb: "Mode S watch-only xPub register or rotate.",
  },
  webhook_failures: {
    label: "Webhook delivery failures",
    blurb: "Signed callback retries that exhaust or fail.",
  },
  service_bills: {
    label: "Service bill issued / overdue",
    blurb: "Platform SaaS invoices that need remittance.",
  },
  site_overrides: {
    label: "Site override requests",
    blurb: "Parent Owner approval for site setting changes.",
  },
};

type Props = { session: Session };

/** D15 — notification preferences (persisted per user + org). */
export function NotificationsSettingsPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canEdit = sessionCanEditOrgSettings(session);
  const [items, setItems] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(await getNotificationPreferences(orgId));
      setDirty(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load notification preferences",
      );
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(
    eventType: string,
    channel: "email" | "inApp",
    value: boolean,
  ) {
    if (!canEdit) return;
    setItems((prev) =>
      prev.map((row) =>
        row.eventType === eventType ? { ...row, [channel]: value } : row,
      ),
    );
    setDirty(true);
    setOkMsg(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canEdit || !dirty) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const saved = await putNotificationPreferences(orgId, items);
      setItems(saved);
      setDirty(false);
      setOkMsg("Notification preferences saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="plat-settings plat-settings--merchant plat-alerts">
      <AuthToast
        message={error ?? okMsg}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setOkMsg(null);
        }}
      />

      <header className="plat-alerts__hero">
        <div className="plat-alerts__hero-main">
          <p className="plat-alerts__eyebrow">Settings</p>
          <div className="plat-alerts__title-row">
            <h1 className="plat-alerts__name">Alerts</h1>
            {!canEdit ? (
              <span className="plat-alerts__chip plat-alerts__chip--muted">
                Viewer · read-only
              </span>
            ) : null}
          </div>
          <p className="plat-alerts__lead">
            Choose email and in-app delivery per event for your account on this
            merchant. The sidebar bell still surfaces operational items that need
            attention.
          </p>
        </div>
      </header>

      <section className="plat-settings__card plat-alerts__card">
        <div className="plat-settings__card-head">
          <h2 className="plat-settings__card-title">Notification preferences</h2>
          {canEdit ? (
            <button
              type="submit"
              form="plat-alerts-form"
              className="btn-primary btn-inline btn-tiny"
              disabled={saving || !dirty || loading}
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>
          ) : null}
        </div>
        <div className="plat-settings__card-body">
          {loading ? (
            <p className="muted">Loading preferences…</p>
          ) : (
            <form id="plat-alerts-form" onSubmit={(e) => void onSave(e)}>
              <div
                className="plat-alerts__table"
                role="table"
                aria-label="Notification preferences"
              >
                <div className="plat-alerts__thead" role="row">
                  <span role="columnheader">Event</span>
                  <span role="columnheader">Email</span>
                  <span role="columnheader">In-app</span>
                </div>
                {items.map((row) => {
                  const meta = NOTIFICATION_META[row.eventType] ?? {
                    label: row.eventType,
                    blurb: "",
                  };
                  return (
                    <div
                      key={row.eventType}
                      className="plat-alerts__row"
                      role="row"
                    >
                      <div className="plat-alerts__event" role="cell">
                        <strong>{meta.label}</strong>
                        {meta.blurb ? <span>{meta.blurb}</span> : null}
                      </div>
                      <label className="plat-alerts__toggle" role="cell">
                        <input
                          type="checkbox"
                          checked={row.email}
                          disabled={!canEdit || saving}
                          onChange={(e) =>
                            toggle(row.eventType, "email", e.target.checked)
                          }
                        />
                        <span className="plat-alerts__switch" aria-hidden />
                        <span className="sr-only">Email for {meta.label}</span>
                      </label>
                      <label className="plat-alerts__toggle" role="cell">
                        <input
                          type="checkbox"
                          checked={row.inApp}
                          disabled={!canEdit || saving}
                          onChange={(e) =>
                            toggle(row.eventType, "inApp", e.target.checked)
                          }
                        />
                        <span className="plat-alerts__switch" aria-hidden />
                        <span className="sr-only">In-app for {meta.label}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </form>
          )}
          <p className="plat-settings__card-note">
            Preferences are stored for your user on this merchant org. Email
            delivery uses your account email when the mailer is configured.
          </p>
        </div>
      </section>
    </div>
  );
}
