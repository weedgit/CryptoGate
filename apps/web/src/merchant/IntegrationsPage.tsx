import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getMerchantIntegrations,
  peekMerchantIntegrations,
} from "./merchantIntegrationsCache";
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

const WEBHOOK_EVENT_LABELS: Record<(typeof WEBHOOK_EVENTS)[number], string> = {
  "payment_order.created": "Order created",
  "payment_order.verifying": "Payment verifying",
  "payment_order.completed": "Payment completed",
  "payment_order.expired": "Order expired",
  "payment_order.payment_anomaly": "Payment anomaly",
  "payment_order.failed": "Payment failed",
};

function webhookEventLabel(event: string): string {
  return event in WEBHOOK_EVENT_LABELS
    ? WEBHOOK_EVENT_LABELS[event as (typeof WEBHOOK_EVENTS)[number]]
    : event;
}

const KEY_SCOPES = ["orders", "webhooks"] as const;
const KEY_SCOPE_LABELS: Record<(typeof KEY_SCOPES)[number], string> = {
  orders: "Payment orders",
  webhooks: "Webhooks",
};
const API_KEYS_HELP =
  "Authenticate server-to-server API requests with HMAC. Use a clear label for each environment, such as production or staging.";
const WEBHOOKS_HELP =
  "When a payment order status changes, CryptoGate notifies your HTTPS endpoint. Verify the signature on every delivery before fulfilling the order.";

const SECRET_ONCE_BADGE = "One-time display";
const SECRET_ONCE_CONFIRM = "Confirm saved";
const SECRET_ONCE_HINT =
  "Copy this credential now and store it in a secure location. It cannot be retrieved after you close this dialog.";

const MAX_API_KEYS = 10;
const MAX_WEBHOOKS = 5;

type Props = { session: Session };

function SecretOnceModal({
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return createPortal(
    <div className="b3-commission-modal-backdrop plat-int-secret-backdrop" role="presentation">
      <div
        className="b3-commission-modal plat-int-secret-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="plat-int-secret-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="b3-commission-modal__head plat-int-secret-modal__head">
          <h3 id="plat-int-secret-title" className="plat-int__secret-title">
            {title}
          </h3>
          <span className="plat-int__chip plat-int__chip--warn">{SECRET_ONCE_BADGE}</span>
        </header>
        <div className="b3-commission-modal__body plat-int-secret-modal__body">
          <p className="plat-int__secret-copy">{hint}</p>
          <div className="plat-int__secret-box">
            <code className="mono">{secret}</code>
            <button type="button" className="btn-ghost btn-tiny" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy to clipboard"}
            </button>
          </div>
        </div>
        <footer className="b3-commission-modal__foot plat-int-secret-modal__foot">
          <button
            type="button"
            className="btn-primary plat-settings__submit plat-int-secret-modal__confirm"
            onClick={onDismiss}
          >
            {SECRET_ONCE_CONFIRM}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
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

  const [keys, setKeys] = useState<ApiKey[]>(
    () => (orgId ? peekMerchantIntegrations(orgId)?.keys : null) ?? [],
  );
  const [hooks, setHooks] = useState<WebhookEndpoint[]>(
    () => (orgId ? peekMerchantIntegrations(orgId)?.hooks : null) ?? [],
  );
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () => !(orgId && peekMerchantIntegrations(orgId)),
  );
  const [hasLoaded, setHasLoaded] = useState(
    () => Boolean(orgId && peekMerchantIntegrations(orgId)),
  );
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
    if (!hasLoaded) setLoading(true);
    setError(null);
    try {
      const bundle = await getMerchantIntegrations(orgId);
      setKeys(bundle.keys);
      setHooks(bundle.hooks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [canView, hasLoaded, orgId]);

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
    if (keys.length >= MAX_API_KEYS) {
      setError(`API key limit reached (${MAX_API_KEYS}). Revoke an unused key before creating another.`);
      return;
    }
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
        title: "API key secret",
        secret: created.secret,
        hint: SECRET_ONCE_HINT,
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
    if (hooks.length >= MAX_WEBHOOKS) {
      setError(
        `Webhook limit reached (${MAX_WEBHOOKS}). Delete an unused endpoint before adding another.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created: WebhookCreated = await registerWebhook({
        url: hookUrl.trim(),
        events: hookEvents,
        orgId,
      });
      setSecretOnce({
        title: "Webhook signing secret",
        secret: created.signingSecret,
        hint: "Use this secret to verify incoming webhook signatures. It cannot be retrieved after you close this dialog.",
      });
      setHookUrl("https://");
      setHookEvents([...WEBHOOK_EVENTS]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to add webhook");
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
              Integrations are not available for Cashier accounts.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const selectedHookUrl =
    hooks.find((h) => h.id === selectedHook)?.url ?? selectedHook;
  const keysAtLimit = keys.length >= MAX_API_KEYS;
  const hooksAtLimit = hooks.length >= MAX_WEBHOOKS;

  return (
    <div className="plat-settings plat-settings--merchant plat-int">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {!canManage ? (
        <p className="plat-int__chip plat-int__chip--muted" style={{ marginBottom: 12 }}>
          Viewer · read-only
        </p>
      ) : null}

      {secretOnce ? (
        <SecretOnceModal
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
            <div className="plat-int__card-meta">
              <span
                className={`plat-int__budget${keysAtLimit ? " is-full" : ""}`}
                title={`Maximum ${MAX_API_KEYS} active API keys`}
              >
                <strong>{loading ? "…" : keys.length}</strong>
                <span aria-hidden="true">/</span>
                <span>{MAX_API_KEYS}</span>
              </span>
              <span className="plat-card-help plat-int__card-help">
                <button
                  type="button"
                  className="plat-card-help__btn"
                  aria-label={API_KEYS_HELP}
                >
                  ?
                </button>
                <span className="plat-card-help__tip" role="tooltip">
                  {API_KEYS_HELP}
                </span>
              </span>
            </div>
          </div>
          <div className="plat-settings__card-body">
            {canManage ? (
              keysAtLimit ? (
                <p className="plat-settings__card-note">
                  Limit reached ({MAX_API_KEYS} active). Revoke an unused key to
                  create another.
                </p>
              ) : (
              <div className="plat-int__form-panel">
                <h3 className="plat-int__section-title">Create API key</h3>
                <form className="plat-int__form" onSubmit={onCreateKey}>
                <label className="plat-settings__field" htmlFor="key-label">
                  <span>Label</span>
                  <input
                    id="key-label"
                    className="plat-settings__input"
                    value={keyLabel}
                    onChange={(e) => setKeyLabel(e.target.value)}
                    maxLength={64}
                    required
                    disabled={busy}
                    placeholder="e.g. Production"
                  />
                </label>

                <fieldset className="plat-settings__field plat-int__fieldset">
                  <legend className="plat-int__field-label">Permissions</legend>
                  <div className="plat-int__option-group plat-int__option-group--choices">
                    {KEY_SCOPES.map((scope) => (
                      <label key={scope} className="plat-int__check">
                        <input
                          type="checkbox"
                          checked={keyScopes.includes(scope)}
                          disabled={busy}
                          onChange={() => toggleKeyScope(scope)}
                        />
                        <span>{KEY_SCOPE_LABELS[scope]}</span>
                      </label>
                    ))}
                  </div>
                  {keyScopes.length === 0 ? (
                    <span className="plat-int__field-hint">
                      Select at least one permission.
                    </span>
                  ) : null}
                </fieldset>

                <label className="plat-settings__field" htmlFor="key-ip-allowlist">
                  <span>Allowed IP addresses</span>
                  <textarea
                    id="key-ip-allowlist"
                    className="plat-settings__input mono"
                    value={keyIpAllowlist}
                    onChange={(e) => setKeyIpAllowlist(e.target.value)}
                    disabled={busy}
                    rows={3}
                    placeholder={"203.0.113.10\n198.51.100.0/24"}
                  />
                  <span className="plat-int__field-hint">
                    Optional. One IP address or CIDR range per line.
                  </span>
                </label>

                <div className="plat-int__expiry-row">
                  <label
                    className="plat-settings__field plat-int__expiry-field"
                    htmlFor="key-expires"
                  >
                    <span>Expiration</span>
                    <span className="plat-int__date-wrap">
                      <input
                        id="key-expires"
                        type="datetime-local"
                        className="plat-settings__input plat-int__datetime-input"
                        value={keyExpiresAt}
                        onChange={(e) => setKeyExpiresAt(e.target.value)}
                        disabled={busy}
                      />
                      <span className="plat-int__date-icon" aria-hidden>
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                          <rect
                            x="2"
                            y="3.5"
                            width="12"
                            height="10.5"
                            rx="1.5"
                            stroke="currentColor"
                            strokeWidth="1.25"
                          />
                          <path
                            d="M5 2v2.5M11 2v2.5M2 7h12"
                            stroke="currentColor"
                            strokeWidth="1.25"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    </span>
                  </label>
                  <button
                    className="btn-primary plat-settings__submit plat-int__generate-btn"
                    type="submit"
                    disabled={busy || !keyLabel.trim() || keyScopes.length === 0}
                  >
                    Generate API key
                  </button>
                </div>
                <span className="plat-int__field-hint plat-int__expiry-hint">
                  Optional.
                </span>
                </form>
              </div>
              )
            ) : (
              <p className="plat-settings__card-note">
                Read-only access. Creating or revoking keys requires Owner or
                Administrator permissions.
              </p>
            )}

            {loading && !hasLoaded ? (
              <p className="muted">Loading API keys…</p>
            ) : keys.length === 0 ? (
              <p className="plat-int__empty">No API keys have been created yet.</p>
            ) : (
              <div className="plat-int__list-section">
                <h3 className="plat-int__section-title">Active keys</h3>
                <ul className="plat-int__list">
                {keys.map((k) => (
                  <li key={k.id} className="plat-int__item">
                    <div className="plat-int__item-main">
                      <div className="plat-int__item-head">
                        <strong>{k.label}</strong>
                        <code className="mono plat-int__item-key">{k.keyId}</code>
                        {canManage ? (
                          <div className="plat-int__actions">
                            <button
                              type="button"
                              className="btn-ghost btn-tiny"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  !orgId ||
                                  !window.confirm(
                                    `Rotate the API key “${k.label}”? The current secret will stop working immediately.`,
                                  )
                                )
                                  return;
                                setBusy(true);
                                try {
                                  const rotated = await rotateApiKey(k.id, { orgId });
                                  setSecretOnce({
                                    title: "New API key secret",
                                    secret: rotated.secret,
                                    hint: "The previous key is now invalid. Copy and store this credential before closing.",
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
                                if (
                                  !orgId ||
                                  !window.confirm(
                                    `Revoke the API key “${k.label}”? This action cannot be undone.`,
                                  )
                                )
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
                      </div>
                      <dl className="plat-int__item-details">
                        <div className="plat-int__detail">
                          <dt>Created</dt>
                          <dd>{formatShortTime(k.createdAt)}</dd>
                        </div>
                        <div className="plat-int__detail">
                          <dt>Last used</dt>
                          <dd>
                            {k.lastUsedAt
                              ? formatShortTime(k.lastUsedAt)
                              : "Not used yet"}
                          </dd>
                        </div>
                        <div className="plat-int__detail">
                          <dt>Permissions</dt>
                          <dd>
                            {k.scopes && k.scopes.length > 0
                              ? k.scopes
                                  .map((scope) =>
                                    scope in KEY_SCOPE_LABELS
                                      ? KEY_SCOPE_LABELS[
                                          scope as (typeof KEY_SCOPES)[number]
                                        ]
                                      : scope,
                                  )
                                  .join(", ")
                              : "—"}
                          </dd>
                        </div>
                        <div className="plat-int__detail">
                          <dt>Allowed IPs</dt>
                          <dd>
                            {k.ipAllowlist && k.ipAllowlist.length > 0
                              ? k.ipAllowlist.join(", ")
                              : "Any"}
                          </dd>
                        </div>
                        <div className="plat-int__detail">
                          <dt>Expiration</dt>
                          <dd>{k.expiresAt ? formatShortTime(k.expiresAt) : "None"}</dd>
                        </div>
                      </dl>
                    </div>
                  </li>
                ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="plat-settings__card plat-int__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Webhooks</h2>
            <div className="plat-int__card-meta">
              <span
                className={`plat-int__budget${hooksAtLimit ? " is-full" : ""}`}
                title={`Maximum ${MAX_WEBHOOKS} webhook endpoints`}
              >
                <strong>{loading ? "…" : hooks.length}</strong>
                <span aria-hidden="true">/</span>
                <span>{MAX_WEBHOOKS}</span>
              </span>
              <span className="plat-card-help plat-int__card-help">
                <button
                  type="button"
                  className="plat-card-help__btn"
                  aria-label={WEBHOOKS_HELP}
                >
                  ?
                </button>
                <span className="plat-card-help__tip" role="tooltip">
                  {WEBHOOKS_HELP}
                </span>
              </span>
            </div>
          </div>
          <div className="plat-settings__card-body">
            {canManage ? (
              hooksAtLimit ? (
                <p className="plat-settings__card-note">
                  Limit reached ({MAX_WEBHOOKS} endpoints). Delete an unused
                  webhook to add another.
                </p>
              ) : (
              <div className="plat-int__form-panel">
                <h3 className="plat-int__section-title">Add webhook</h3>
                <form className="plat-int__form" onSubmit={onRegisterHook}>
                <label className="plat-settings__field" htmlFor="hook-url">
                  <span>Endpoint URL</span>
                  <input
                    id="hook-url"
                    className="plat-settings__input mono"
                    value={hookUrl}
                    onChange={(e) => setHookUrl(e.target.value)}
                    required
                    disabled={busy}
                    placeholder="https://example.com/webhooks/cryptogate"
                  />
                  <span className="plat-int__field-hint">
                    HTTPS required. Signed event notifications are posted to this URL.
                  </span>
                </label>

                <fieldset className="plat-settings__field plat-int__fieldset">
                  <legend className="plat-int__field-label">Notify on</legend>
                  <div className="plat-int__option-group plat-int__option-group--choices plat-int__option-group--events">
                    {WEBHOOK_EVENTS.map((event) => (
                      <label key={event} className="plat-int__check">
                        <input
                          type="checkbox"
                          checked={hookEvents.includes(event)}
                          disabled={busy}
                          onChange={() => toggleHookEvent(event)}
                        />
                        <span>{WEBHOOK_EVENT_LABELS[event]}</span>
                      </label>
                    ))}
                  </div>
                  {hookEvents.length === 0 ? (
                    <span className="plat-int__field-hint">
                      Select at least one event.
                    </span>
                  ) : null}
                </fieldset>

                <button
                  className="btn-primary plat-settings__submit"
                  type="submit"
                  disabled={busy || hookEvents.length === 0}
                >
                  Add webhook
                </button>
                </form>
              </div>
              )
            ) : null}

            {loading && !hasLoaded ? (
              <p className="muted">Loading webhooks…</p>
            ) : hooks.length === 0 ? (
              <p className="plat-int__empty">No webhooks have been added yet.</p>
            ) : (
              <div className="plat-int__list-section">
                <h3 className="plat-int__section-title">Active endpoints</h3>
                <ul className="plat-int__list">
                {hooks.map((h) => (
                  <li
                    key={h.id}
                    className={`plat-int__item${
                      selectedHook === h.id ? " is-selected" : ""
                    }`}
                  >
                    <div className="plat-int__item-main">
                      <div className="plat-int__item-head">
                        <strong className="mono plat-int__url">{h.url}</strong>
                        <div className="plat-int__actions">
                          <button
                            type="button"
                            className="btn-ghost btn-tiny"
                            onClick={() => void loadDeliveries(h.id)}
                          >
                            Delivery history
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
                                    setTestMsg(
                                      r.queued === 1
                                        ? "Test notification queued."
                                        : `${r.queued} test notifications queued.`,
                                    );
                                  } catch (err) {
                                    setError(
                                      err instanceof ApiError
                                        ? err.message
                                        : "Unable to send test notification",
                                    );
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Send test
                              </button>
                              <button
                                type="button"
                                className="btn-ghost btn-tiny"
                                disabled={busy}
                                onClick={async () => {
                                  if (
                                    !orgId ||
                                    !window.confirm(
                                      "Rotate the signing secret for this webhook? The current secret will stop working immediately.",
                                    )
                                  )
                                    return;
                                  setBusy(true);
                                  setError(null);
                                  try {
                                    const rotated = await rotateWebhookSecret(h.id, orgId);
                                    setSecretOnce({
                                      title: "New webhook signing secret",
                                      secret: rotated.signingSecret,
                                      hint: "Update your signature verification with this secret. The previous secret is no longer valid.",
                                    });
                                  } catch (err) {
                                    setError(
                                      err instanceof ApiError
                                        ? err.message
                                        : "Unable to rotate signing secret",
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
                                    !window.confirm(
                                      "Delete this webhook? Delivery history will no longer be available for this endpoint.",
                                    )
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
                                        : "Unable to delete webhook",
                                    );
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <p className="plat-int__item-meta">
                        {h.events.length}{" "}
                        {h.events.length === 1 ? "event" : "events"} ·{" "}
                        <span
                          className={`plat-int__status is-${
                            h.enabled ? "on" : "off"
                          }`}
                        >
                          {h.enabled ? "Active" : "Inactive"}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedHook ? (
        <section className="plat-settings__card plat-int__card plat-int__card--log">
          <div className="plat-settings__card-head">
            <div>
              <h2 className="plat-settings__card-title">Delivery history</h2>
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
              <p className="plat-int__empty">No deliveries recorded for this webhook yet.</p>
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
                        <td>{webhookEventLabel(d.eventType)}</td>
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
                                      : "Unable to resend delivery",
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
