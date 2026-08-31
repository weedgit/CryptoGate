import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createApiKey,
  deleteWebhook,
  listApiKeys,
  listWebhookDeliveries,
  listWebhooks,
  registerWebhook,
  resendWebhookDelivery,
  revokeApiKey,
  rotateApiKey,
  rotateWebhookSecret,
  testWebhook,
  type ApiKey,
  type ApiKeyCreated,
  type Session,
  type WebhookCreated,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "./api";
import { AuthToast } from "../auth/AuthToast";
import { formatShortTime } from "./orderStatus";
import {
  primaryMerchantOrgId,
  sessionCanManageIntegrations,
  sessionCanViewIntegrations,
} from "./org";

const WEBHOOK_EVENTS = [
  "payment_order.created",
  "payment_order.verifying",
  "payment_order.completed",
  "payment_order.expired",
  "payment_order.payment_anomaly",
  "payment_order.failed",
] as const;

const KEY_SCOPES = ["orders", "webhooks"] as const;

type Props = { session: Session };

function SecretOncePanel({
  title,
  secret,
  hint,
  onDismiss,
}: {
  title: string;
  secret: string;
  hint: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="plat-int__secret" role="alert">
      <div className="plat-int__secret-head">
        <h3 className="plat-int__secret-title">{title}</h3>
        <span className="plat-int__chip plat-int__chip--warn">Show once</span>
      </div>
      <p className="plat-int__secret-copy">{hint}</p>
      <div className="plat-int__secret-box">
        <code className="mono">{secret}</code>
        <button type="button" className="btn-ghost btn-tiny" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button type="button" className="btn-primary plat-settings__submit" onClick={onDismiss}>
        I have stored this secret
      </button>
    </div>
  );
}

function deliveryTone(status: string): string {
  if (status === "success" || status === "delivered") return "ok";
  if (status === "failed" || status === "dead") return "bad";
  return "muted";
}

function parseIpAllowlist(raw: string): string[] | undefined {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : undefined;
}

function expiresAtToIso(localValue: string): string | undefined {
  const trimmed = localValue.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function IntegrationsPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canView = useMemo(() => sessionCanViewIntegrations(session), [session]);
  const canManage = useMemo(() => sessionCanManageIntegrations(session), [session]);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>([...KEY_SCOPES]);
  const [keyIpAllowlist, setKeyIpAllowlist] = useState("");
  const [keyExpiresAt, setKeyExpiresAt] = useState("");
  const [hookUrl, setHookUrl] = useState("https://");
  const [hookEvents, setHookEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [secretOnce, setSecretOnce] = useState<{
    title: string;
    secret: string;
    hint: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [k, w] = await Promise.all([listApiKeys(orgId), listWebhooks(orgId)]);
      setKeys(k);
      setHooks(w);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [canView, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadDeliveries(webhookId: string) {
    if (!orgId) return;
    setSelectedHook(webhookId);
    try {
      const rows = await listWebhookDeliveries(webhookId, orgId);
      setDeliveries(rows);
    } catch (err) {
      setDeliveries([]);
      setError(err instanceof ApiError ? err.message : "Failed to load deliveries");
    }
  }

  function toggleKeyScope(scope: string) {
    setKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function toggleHookEvent(event: string) {
    setHookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  async function onCreateKey(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !keyLabel.trim() || keyScopes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const created: ApiKeyCreated = await createApiKey({
        label: keyLabel.trim(),
        scopes: keyScopes,
        ipAllowlist: parseIpAllowlist(keyIpAllowlist),
        expiresAt: expiresAtToIso(keyExpiresAt),
        orgId,
      });
      setSecretOnce({
        title: "API key secret — copy now",
        secret: created.secret,
        hint: "This secret is shown once. Store it securely; it cannot be retrieved again.",
      });
      setKeyLabel("");
      setKeyScopes([...KEY_SCOPES]);
      setKeyIpAllowlist("");
      setKeyExpiresAt("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create key failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRegisterHook(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !hookUrl.trim() || hookEvents.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const created: WebhookCreated = await registerWebhook({
        url: hookUrl.trim(),
        events: hookEvents,
        orgId,
      });
      setSecretOnce({
        title: "Webhook signing secret — copy now",
        secret: created.signingSecret,
        hint: "Verify signatures with this secret. It is never shown again after you dismiss.",
      });
      setHookUrl("https://");
      setHookEvents([...WEBHOOK_EVENTS]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Register webhook failed");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="plat-settings plat-settings--merchant plat-int">
        <section className="plat-settings__card">
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Cashiers cannot view API keys or webhooks.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const selectedHookUrl =
    hooks.find((h) => h.id === selectedHook)?.url ?? selectedHook;

  return (
    <div className="plat-settings plat-settings--merchant plat-int">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <header className="plat-int__hero">
        <div className="plat-int__hero-main">
          <p className="plat-int__eyebrow">Settings</p>
          <div className="plat-int__title-row">
            <h1 className="plat-int__name">Integrations</h1>
            {!canManage ? (
              <span className="plat-int__chip plat-int__chip--muted">
                Viewer · read-only
              </span>
            ) : null}
          </div>
          <p className="plat-int__lead">
            Machine API keys and signed webhooks for payment-order status —
            separate from guest payment pages. Secrets are shown once on create.
          </p>
        </div>
        <div className="plat-int__kpis" aria-label="Integration summary">
          <article className="plat-int__kpi">
            <span className="plat-int__kpi-label">API keys</span>
            <strong className="plat-int__kpi-value">{loading ? "…" : keys.length}</strong>
            <span className="plat-int__kpi-hint">Max 10 active</span>
          </article>
          <article className="plat-int__kpi">
            <span className="plat-int__kpi-label">Webhooks</span>
            <strong className="plat-int__kpi-value">{loading ? "…" : hooks.length}</strong>
            <span className="plat-int__kpi-hint">Max 5 endpoints</span>
          </article>
        </div>
      </header>

      {secretOnce ? (
        <SecretOncePanel
          title={secretOnce.title}
          secret={secretOnce.secret}
          hint={secretOnce.hint}
          onDismiss={() => setSecretOnce(null)}
        />
      ) : null}

      {testMsg ? (
        <p className="plat-int__toast-ok" role="status">
          {testMsg}
        </p>
      ) : null}

      <div className="plat-int__grid">
        <section className="plat-settings__card plat-int__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">API keys</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              HMAC signing for server-to-server calls. Label keys by environment
              (e.g. production, staging).
            </p>

            {canManage ? (
              <form className="plat-int__form" onSubmit={onCreateKey}>
                <label className="plat-settings__field" htmlFor="key-label">
                  <span>New key label</span>
                  <input
                    id="key-label"
                    className="plat-settings__input"
                    value={keyLabel}
                    onChange={(e) => setKeyLabel(e.target.value)}
                    maxLength={64}
                    required
                    disabled={busy}
                    placeholder="production"
                  />
                </label>

                <fieldset className="plat-settings__field">
                  <span>Scopes</span>
                  <div className="plat-int__checks">
                    {KEY_SCOPES.map((scope) => (
                      <label key={scope} className="plat-int__check">
                        <input
                          type="checkbox"
                          checked={keyScopes.includes(scope)}
                          disabled={busy}
                          onChange={() => toggleKeyScope(scope)}
                        />
                        <span>{scope}</span>
                      </label>
                    ))}
                  </div>
                  {keyScopes.length === 0 ? (
                    <span className="plat-int__field-hint">Select at least one scope.</span>
                  ) : null}
                </fieldset>

                <label className="plat-settings__field" htmlFor="key-ip-allowlist">
                  <span>IP allowlist (optional)</span>
                  <textarea
                    id="key-ip-allowlist"
                    className="plat-settings__input mono"
                    value={keyIpAllowlist}
                    onChange={(e) => setKeyIpAllowlist(e.target.value)}
                    disabled={busy}
                    rows={3}
                    placeholder={"203.0.113.10\n198.51.100.0/24"}
                  />
                  <span className="plat-int__field-hint">One IP or CIDR per line.</span>
                </label>

                <label className="plat-settings__field" htmlFor="key-expires">
                  <span>Expires (optional)</span>
                  <input
                    id="key-expires"
                    type="datetime-local"
                    className="plat-settings__input"
                    value={keyExpiresAt}
                    onChange={(e) => setKeyExpiresAt(e.target.value)}
                    disabled={busy}
                  />
                </label>

                <button
                  className="btn-primary plat-settings__submit"
                  type="submit"
                  disabled={busy || !keyLabel.trim() || keyScopes.length === 0}
                >
                  Create API key
                </button>
              </form>
            ) : (
              <p className="plat-settings__card-note">
                Viewer access — create/revoke requires Owner or Administrator.
              </p>
            )}

            {loading ? (
              <p className="muted">Loading keys…</p>
            ) : keys.length === 0 ? (
              <p className="plat-int__empty">No active API keys.</p>
            ) : (
              <ul className="plat-int__list">
                {keys.map((k) => (
                  <li key={k.id} className="plat-int__item">
                    <div className="plat-int__item-main">
                      <strong>{k.label}</strong>
                      <code className="mono plat-int__meta">{k.keyId}</code>
                      <span className="plat-int__meta">
                        Created {formatShortTime(k.createdAt)}
                        {k.lastUsedAt
                          ? ` · Last used ${formatShortTime(k.lastUsedAt)}`
                          : " · Never used"}
                      </span>
                      <span className="plat-int__meta">
                        Scopes:{" "}
                        {k.scopes && k.scopes.length > 0
                          ? k.scopes.join(", ")
                          : "—"}
                      </span>
                      <span className="plat-int__meta">
                        IP allowlist:{" "}
                        {k.ipAllowlist && k.ipAllowlist.length > 0
                          ? k.ipAllowlist.join(", ")
                          : "None"}
                      </span>
                      <span className="plat-int__meta">
                        Expires:{" "}
                        {k.expiresAt ? formatShortTime(k.expiresAt) : "Never"}
                      </span>
                    </div>
                    {canManage ? (
                      <div className="plat-int__actions">
                        <button
                          type="button"
                          className="btn-ghost btn-tiny"
                          disabled={busy}
                          onClick={async () => {
                            if (!orgId || !window.confirm(`Rotate key "${k.label}"?`))
                              return;
                            setBusy(true);
                            try {
                              const rotated = await rotateApiKey(k.id, { orgId });
                              setSecretOnce({
                                title: "Rotated API key secret",
                                secret: rotated.secret,
                                hint: "Old keyId stops working immediately.",
                              });
                              await load();
                            } catch (err) {
                              setError(
                                err instanceof ApiError ? err.message : "Rotate failed",
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Rotate
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-tiny plat-int__danger"
                          disabled={busy}
                          onClick={async () => {
                            if (!orgId || !window.confirm(`Revoke key "${k.label}"?`))
                              return;
                            setBusy(true);
                            try {
                              await revokeApiKey(k.id, orgId);
                              await load();
                            } catch (err) {
                              setError(
                                err instanceof ApiError ? err.message : "Revoke failed",
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="plat-settings__card plat-int__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Webhooks</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              HTTPS callbacks for payment-order events. Payloads are signed —
              verify before fulfilling.
            </p>

            {canManage ? (
              <form className="plat-int__form" onSubmit={onRegisterHook}>
                <label className="plat-settings__field" htmlFor="hook-url">
                  <span>Callback URL (HTTPS)</span>
                  <input
                    id="hook-url"
                    className="plat-settings__input mono"
                    value={hookUrl}
                    onChange={(e) => setHookUrl(e.target.value)}
                    required
                    disabled={busy}
                    placeholder="https://example.com/webhooks/cryptogate"
                  />
                </label>

                <fieldset className="plat-settings__field">
                  <span>Events</span>
                  <div className="plat-int__checks">
                    {WEBHOOK_EVENTS.map((event) => (
                      <label key={event} className="plat-int__check">
                        <input
                          type="checkbox"
                          checked={hookEvents.includes(event)}
                          disabled={busy}
                          onChange={() => toggleHookEvent(event)}
                        />
                        <span className="mono">{event}</span>
                      </label>
                    ))}
                  </div>
                  {hookEvents.length === 0 ? (
                    <span className="plat-int__field-hint">Select at least one event.</span>
                  ) : null}
                </fieldset>

                <button
                  className="btn-primary plat-settings__submit"
                  type="submit"
                  disabled={busy || hookEvents.length === 0}
                >
                  Register webhook
                </button>
              </form>
            ) : null}

            {loading ? (
              <p className="muted">Loading webhooks…</p>
            ) : hooks.length === 0 ? (
              <p className="plat-int__empty">No webhook endpoints registered.</p>
            ) : (
              <ul className="plat-int__list">
                {hooks.map((h) => (
                  <li
                    key={h.id}
                    className={`plat-int__item${
                      selectedHook === h.id ? " is-selected" : ""
                    }`}
                  >
                    <div className="plat-int__item-main">
                      <strong className="mono plat-int__url">{h.url}</strong>
                      <span className="plat-int__meta">
                        {h.events.length} event types ·{" "}
                        <span
                          className={`plat-int__status is-${
                            h.enabled ? "on" : "off"
                          }`}
                        >
                          {h.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </span>
                    </div>
                    <div className="plat-int__actions">
                      <button
                        type="button"
                        className="btn-ghost btn-tiny"
                        onClick={() => void loadDeliveries(h.id)}
                      >
                        Deliveries
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className="btn-ghost btn-tiny"
                            disabled={busy}
                            onClick={async () => {
                              if (!orgId) return;
                              setBusy(true);
                              setTestMsg(null);
                              try {
                                const r = await testWebhook({
                                  webhookId: h.id,
                                  orgId,
                                });
                                setTestMsg(`Queued ${r.queued} test delivery(ies).`);
                              } catch (err) {
                                setError(
                                  err instanceof ApiError ? err.message : "Test failed",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-tiny"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !orgId ||
                                !window.confirm(
                                  "Rotate webhook signing secret? The old secret stops working immediately.",
                                )
                              )
                                return;
                              setBusy(true);
                              setError(null);
                              try {
                                const rotated = await rotateWebhookSecret(h.id, orgId);
                                setSecretOnce({
                                  title: "Rotated webhook signing secret",
                                  secret: rotated.signingSecret,
                                  hint: "Update your verifier with this secret. The previous secret is invalid.",
                                });
                              } catch (err) {
                                setError(
                                  err instanceof ApiError
                                    ? err.message
                                    : "Rotate secret failed",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Rotate secret
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-tiny plat-int__danger"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !orgId ||
                                !window.confirm("Remove this webhook endpoint?")
                              )
                                return;
                              setBusy(true);
                              try {
                                await deleteWebhook(h.id, orgId);
                                if (selectedHook === h.id) {
                                  setSelectedHook(null);
                                  setDeliveries([]);
                                }
                                await load();
                              } catch (err) {
                                setError(
                                  err instanceof ApiError
                                    ? err.message
                                    : "Delete failed",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {selectedHook ? (
        <section className="plat-settings__card plat-int__card plat-int__card--log">
          <div className="plat-settings__card-head">
            <div>
              <h2 className="plat-settings__card-title">Delivery log</h2>
              <p className="plat-int__log-sub mono">{selectedHookUrl}</p>
            </div>
            <button
              type="button"
              className="btn-ghost btn-tiny"
              onClick={() => {
                setSelectedHook(null);
                setDeliveries([]);
              }}
            >
              Close
            </button>
          </div>
          <div className="plat-settings__card-body">
            {deliveries.length === 0 ? (
              <p className="plat-int__empty">No deliveries yet for this endpoint.</p>
            ) : (
              <div className="plat-int__table-wrap">
                <table className="plat-int__table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Status</th>
                      <th>HTTP</th>
                      <th>Attempt</th>
                      <th>Time</th>
                      {canManage ? <th aria-label="Actions" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.id}>
                        <td className="mono">{d.eventType}</td>
                        <td>
                          <span
                            className={`plat-int__badge is-${deliveryTone(d.status)}`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td>{d.responseStatus ?? d.httpStatus ?? "—"}</td>
                        <td>{d.attempt}</td>
                        <td className="muted">
                          {formatShortTime(d.deliveredAt ?? d.createdAt)}
                        </td>
                        {canManage ? (
                          <td className="plat-int__td-action">
                            <button
                              type="button"
                              className="btn-ghost btn-tiny"
                              disabled={
                                busy ||
                                (d.status !== "failed" && d.status !== "success")
                              }
                              onClick={async () => {
                                if (!orgId || !selectedHook) return;
                                setBusy(true);
                                setError(null);
                                try {
                                  await resendWebhookDelivery(
                                    selectedHook,
                                    d.id,
                                    orgId,
                                  );
                                  setTestMsg("Delivery queued for resend.");
                                  await loadDeliveries(selectedHook);
                                } catch (err) {
                                  setError(
                                    err instanceof ApiError
                                      ? err.message
                                      : "Resend failed",
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Resend
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
