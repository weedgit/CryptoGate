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

const DEFAULT_NOTIFICATION_ITEMS: NotificationPreference[] = Object.keys(
  NOTIFICATION_META,
).map((eventType) => ({
  eventType,
  email: false,
  inApp: true,
}));

type Props = { session: Session };

function formatLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404 && err.message === "Not found") {
      return "Alerts API route not found — restart the API after migration 048.";
    }
    return err.message;
  }
  return "Failed to load notification preferences";
}

/** D15 — notification preferences (persisted per user + org). */
export function NotificationsSettingsPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canEdit = sessionCanEditOrgSettings(session);
  const [items, setItems] = useState<NotificationPreference[]>(
    DEFAULT_NOTIFICATION_ITEMS,
  );
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoadError("No merchant organization is available for this account.");
      setItems(DEFAULT_NOTIFICATION_ITEMS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      const loaded = await getNotificationPreferences(orgId);
      setEmailAvailable(loaded.emailAvailable);
      setItems(
        loaded.items.length > 0 ? loaded.items : DEFAULT_NOTIFICATION_ITEMS,
      );
      setDirty(false);
    } catch (err) {
      setLoadError(formatLoadError(err));
      setItems(DEFAULT_NOTIFICATION_ITEMS);
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
    if (!canEdit || (channel === "email" && !emailAvailable)) return;
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
      setEmailAvailable(saved.emailAvailable);
      setItems(saved.items);
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
          <div className="plat-alerts__title-row">
            <h1 className="plat-alerts__name">Alerts</h1>
            {!canEdit ? (
              <span className="plat-alerts__chip plat-alerts__chip--muted">
                Viewer · read-only
              </span>
            ) : null}
          </div>
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
              disabled={saving || !dirty || loading || Boolean(loadError)}
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>
          ) : null}
        </div>
        <div className="plat-settings__card-body">
          {loading ? (
            <p className="muted">Loading preferences…</p>
          ) : (
            <>
              {loadError ? (
                <p className="plat-settings__card-note plat-alerts__load-error">
                  {loadError} Showing default preferences until preferences can
                  be loaded from the server.
                </p>
              ) : null}
              <form id="plat-alerts-form" onSubmit={(e) => void onSave(e)}>
              <div
                className={`plat-alerts__table${emailAvailable ? "" : " plat-alerts__table--email-unavailable"}`}
                role="table"
                aria-label="Notification preferences"
              >
                <div className="plat-alerts__thead" role="row">
                  <span role="columnheader">Event</span>
                  <span role="columnheader" className="plat-alerts__col-email">
                    Email
                    {!emailAvailable ? (
                      <span className="plat-alerts__chip plat-alerts__chip--muted plat-alerts__chip--soon">
                        Unavailable
                      </span>
                    ) : null}
                  </span>
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
                          checked={emailAvailable ? row.email : false}
                          disabled={!canEdit || saving || !emailAvailable}
                          onChange={(e) =>
                            toggle(row.eventType, "email", e.target.checked)
                          }
                        />
                        <span className="plat-alerts__switch" aria-hidden />
                        <span className="sr-only">
                          Email for {meta.label}
                          {!emailAvailable ? " (unavailable)" : ""}
                        </span>
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
            </>
          )}
        </div>
      </section>
    </div>
  );
}
