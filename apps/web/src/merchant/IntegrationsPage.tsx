import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createApiKey,
  deleteWebhook,
  listApiKeys,
  listWebhookDeliveries,
  listWebhooks,
  registerWebhook,
  revokeApiKey,
  rotateApiKey,
  testWebhook,
  type ApiKey,
  type ApiKeyCreated,
  type Session,
  type WebhookCreated,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "./api";
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
    <div className="secret-once plat-settings__card plat-settings__card--warn" role="alert">
      <div className="plat-settings__card-head">
        <h3 className="plat-settings__card-title">{title}</h3>
      </div>
      <div className="plat-settings__card-body">
        <p className="plat-settings__card-copy">{hint}</p>
        <div className="addr-box addr-copy-row">
          <span className="mono">{secret}</span>
          <button type="button" className="btn-ghost btn-tiny" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button type="button" className="btn-primary plat-settings__submit" onClick={onDismiss}>
          I have stored this secret
        </button>
      </div>
    </div>
  );
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
  const [hookUrl, setHookUrl] = useState("https://");
  const [secretOnce, setSecretOnce] = useState<{ title: string; secret: string; hint: string } | null>(
    null,
  );
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

  async function onCreateKey(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !keyLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created: ApiKeyCreated = await createApiKey({ label: keyLabel.trim(), orgId });
      setSecretOnce({
        title: "API key secret — copy now",
        secret: created.secret,
        hint: "This secret is shown once. Store it securely; it cannot be retrieved again.",
      });
      setKeyLabel("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create key failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRegisterHook(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !hookUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created: WebhookCreated = await registerWebhook({
        url: hookUrl.trim(),
        events: [...WEBHOOK_EVENTS],
        orgId,
      });
      setSecretOnce({
        title: "Webhook signing secret — copy now",
        secret: created.signingSecret,
        hint: "Verify signatures with this secret. It is never shown again after you dismiss.",
      });
      setHookUrl("https://");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Register webhook failed");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="plat-settings plat-settings--merchant">
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

  return (
    <div className="plat-settings plat-settings--merchant integrations-page">
      <p className="plat-settings__notice" role="note">
        Machine API keys and signed webhooks for order status — separate from guest payment
        pages. Secrets are shown once on create.
      </p>

      {secretOnce ? (
        <SecretOncePanel
          title={secretOnce.title}
          secret={secretOnce.secret}
          hint={secretOnce.hint}
          onDismiss={() => setSecretOnce(null)}
        />
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading integrations…</p> : null}

      <div className="plat-settings__grid integrations-grid">
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">API keys</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              HMAC signing for server-to-server calls. Max 10 active keys.
            </p>
          {keys.length === 0 ? (
            <p className="muted">No active API keys.</p>
          ) : (
            <div className="integrations-list">
              {keys.map((k) => (
                <div key={k.id} className="integrations-row">
                  <div>
                    <strong>{k.label}</strong>
                    <p className="mono muted">{k.keyId}</p>
                    <p className="muted" style={{ fontSize: 11 }}>
                      Created {formatShortTime(k.createdAt)}
                      {k.lastUsedAt ? ` · Last used ${formatShortTime(k.lastUsedAt)}` : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="integrations-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-tiny"
                        disabled={busy}
                        onClick={async () => {
                          if (!orgId || !window.confirm(`Rotate key "${k.label}"?`)) return;
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
                            setError(err instanceof ApiError ? err.message : "Rotate failed");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-tiny"
                        disabled={busy}
                        onClick={async () => {
                          if (!orgId || !window.confirm(`Revoke key "${k.label}"?`)) return;
                          setBusy(true);
                          try {
                            await revokeApiKey(k.id, orgId);
                            await load();
                          } catch (err) {
                            setError(err instanceof ApiError ? err.message : "Revoke failed");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {canManage ? (
            <form className="plat-settings__payout-form" onSubmit={onCreateKey}>
              <label className="plat-settings__field" htmlFor="key-label">
                New key label
                <input
                  id="key-label"
                  className="plat-settings__input"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  maxLength={64}
                  required
                  disabled={busy}
                />
              </label>
              <button
                className="btn-primary plat-settings__submit"
                type="submit"
                disabled={busy || !keyLabel.trim()}
              >
                Create API key
              </button>
            </form>
          ) : (
            <p className="plat-settings__card-note">
              Viewer access — create/revoke requires Owner or Administrator.
            </p>
          )}
          </div>
        </section>

        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Webhooks</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              HTTPS callbacks for payment order events. Max 5 endpoints.
            </p>
          {hooks.length === 0 ? (
            <p className="muted">No webhook endpoints registered.</p>
          ) : (
            <div className="integrations-list">
              {hooks.map((h) => (
                <div key={h.id} className="integrations-row">
                  <div>
                    <strong className="mono">{h.url}</strong>
                    <p className="muted" style={{ fontSize: 11 }}>
                      {h.events.length} event types · {h.enabled ? "enabled" : "disabled"}
                    </p>
                  </div>
                  <div className="integrations-actions">
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
                              const r = await testWebhook({ webhookId: h.id, orgId });
                              setTestMsg(`Queued ${r.queued} test delivery(ies).`);
                            } catch (err) {
                              setError(err instanceof ApiError ? err.message : "Test failed");
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
                            if (!orgId || !window.confirm("Remove this webhook endpoint?")) return;
                            setBusy(true);
                            try {
                              await deleteWebhook(h.id, orgId);
                              if (selectedHook === h.id) {
                                setSelectedHook(null);
                                setDeliveries([]);
                              }
                              await load();
                            } catch (err) {
                              setError(err instanceof ApiError ? err.message : "Delete failed");
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
                </div>
              ))}
            </div>
          )}
          {testMsg ? <p className="plat-settings__card-note">{testMsg}</p> : null}
          {canManage ? (
            <form className="plat-settings__payout-form" onSubmit={onRegisterHook}>
              <label className="plat-settings__field" htmlFor="hook-url">
                Callback URL (HTTPS)
                <input
                  id="hook-url"
                  className="plat-settings__input"
                  value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <button className="btn-primary plat-settings__submit" type="submit" disabled={busy}>
                Register webhook
              </button>
            </form>
          ) : null}
          </div>
        </section>
      </div>

      {selectedHook ? (
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h3 className="plat-settings__card-title">Delivery log</h3>
          </div>
          <div className="plat-settings__card-body">
          {deliveries.length === 0 ? (
            <p className="muted">No deliveries yet for this endpoint.</p>
          ) : (
            <div className="delivery-table">
              <div className="delivery-head">
                <span>EVENT</span>
                <span>STATUS</span>
                <span>HTTP</span>
                <span>ATTEMPT</span>
                <span>TIME</span>
              </div>
              {deliveries.map((d) => (
                <div key={d.id} className="delivery-row">
                  <span className="mono">{d.eventType}</span>
                  <span>{d.status}</span>
                  <span>{d.responseStatus ?? "—"}</span>
                  <span>{d.attempt}</span>
                  <span className="muted">{formatShortTime(d.deliveredAt ?? d.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
