import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getMerchantIntegrations,
  invalidateMerchantIntegrations,
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
import {
  liveActionLockedHint,
  sessionLiveActionsUnlocked,
} from "../auth/contactVerification";
import { SetupChecklistCard } from "../auth/SetupChecklistCard";
import { GoldWaves } from "../shared/GoldWaves";
import { ConfirmActionModal, type ConfirmRequest } from "../shared/ConfirmActionModal";
import { formatShortTime } from "./orderStatus";
import {
  SETTLEMENT_ICONS,
  SettlementSectionHead,
  type SettlementIconKind,
} from "./SettlementSectionHead";
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
  "payment_order.payment_anomaly": "Attention",
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
  "When a payment order status changes, PaymentGate notifies your HTTPS endpoint. Verify the signature on every delivery before fulfilling the order.";

const SECRET_ONCE_BADGE = "One-time display";
const SECRET_ONCE_CONFIRM = "Confirm saved";
const SECRET_ONCE_HINT =
  "Copy this credential now and store it in a secure location. It cannot be retrieved after you close this dialog.";

const MAX_API_KEYS = 10;
const MAX_WEBHOOKS = 5;

type Props = { session: Session };

function CardHelp({ text }: { text: string }) {
  return (
    <span className="plat-card-help plat-int__card-help">
      <button type="button" className="plat-card-help__btn" aria-label={text}>
        ?
      </button>
      <span className="plat-card-help__tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function Budget({
  used,
  max,
  loading,
  title,
}: {
  used: number;
  max: number;
  loading: boolean;
  title: string;
}) {
  return (
    <span
      className={`plat-int__budget${used >= max ? " is-full" : ""}`}
      title={title}
    >
      <strong>{loading ? "…" : used}</strong>
      <span aria-hidden="true">/</span>
      <span>{max}</span>
    </span>
  );
}

function EmptyState({
  icon,
  title,
  copy,
}: {
  icon: SettlementIconKind;
  title: string;
  copy: string;
}) {
  return (
    <div className="plat-int__empty">
      <span className="plat-int__empty-icon" aria-hidden>
        {SETTLEMENT_ICONS[icon]}
      </span>
      <strong className="plat-int__empty-title">{title}</strong>
      <span className="plat-int__empty-copy">{copy}</span>
    </div>
  );
}

const EXPIRES_SOON_MS = 7 * 24 * 60 * 60 * 1000;

function KeyStateBadge({ expiresAt }: { expiresAt?: string | null }) {
  const left = expiresAt ? new Date(expiresAt).getTime() - Date.now() : Infinity;
  const [tone, label] =
    left <= 0 ? ["expired", "Expired"] : left <= EXPIRES_SOON_MS ? ["soon", "Expires soon"] : ["active", "Active"];
  return <span className={`plat-int__state is-${tone}`}>{label}</span>;
}

function KeyIdCopy({ keyId }: { keyId: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <span className="plat-int__key-id">
      <code className="mono">{keyId}</code>
      <button
        type="button"
        className={`plat-int__copy${copied ? " is-copied" : ""}`}
        aria-label={copied ? "Key ID copied" : "Copy key ID"}
        title={copied ? "Copied" : "Copy key ID"}
        onClick={() => {
          void navigator.clipboard.writeText(keyId).then(
            () => setCopied(true),
            () => undefined,
          );
        }}
      >
        {copied ? (
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="m3.5 8.5 3 3 6-7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="5" y="5" width="8.5" height="8.5" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M10.5 3.2A1.7 1.7 0 0 0 9 2.5H4.2A1.7 1.7 0 0 0 2.5 4.2V9a1.7 1.7 0 0 0 .7 1.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </span>
  );
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  const titleId = useId();
  const hintId = useId();

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
        className="b3-commission-modal b3-owner-edit org-profile-edit-modal plat-int-secret-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            {SETTLEMENT_ICONS.key}
          </span>
          <div className="org-edit__head-copy">
            <h3 id={titleId}>{title}</h3>
            <p>Shown once — store it before closing.</p>
          </div>
          <GoldWaves id={`${titleId.replace(/:/g, "")}-wave`} className="org-edit__waves" />
          <span className="plat-int-secret-modal__badge">{SECRET_ONCE_BADGE}</span>
        </header>
        <div className="owner-acct">
          <div className="owner-acct__form plat-int-secret-modal__form">
            <p className="plat-int-secret-modal__warn" id={hintId}>
              <span className="plat-int-secret-modal__warn-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
                  <path d="M12 10v4.5M12 17.5h.01" />
                </svg>
              </span>
              <span>{hint}</span>
            </p>
            <div className="owner-acct__field owner-acct__field--wide">
              <span className="owner-acct__label">Secret</span>
              <div className="plat-int-secret-modal__secret">
                <code className="mono">{secret}</code>
                <button
                  type="button"
                  className={`plat-int-secret-modal__copy${copied ? " is-copied" : ""}`}
                  onClick={() => void copy()}
                >
                  {copied ? (
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                      <rect x="5" y="5" width="8.5" height="8.5" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M10.5 3.2A1.7 1.7 0 0 0 9 2.5H4.2A1.7 1.7 0 0 0 2.5 4.2V9a1.7 1.7 0 0 0 .7 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
          <footer className="owner-acct__foot">
            <span className="plat-int-secret-modal__foot-note">
              {copied ? "Copied to clipboard." : "It cannot be retrieved later."}
            </span>
            <button type="button" className="owner-acct__save" onClick={onDismiss}>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {SECRET_ONCE_CONFIRM}
            </button>
          </footer>
        </div>
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
  const liveUnlocked = useMemo(
    () => sessionLiveActionsUnlocked(session),
    [session],
  );
  const canWrite = canManage && liveUnlocked;
  const setupLockHint = liveActionLockedHint(session);

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
  const [confirmReq, setConfirmReq] = useState<
    (ConfirmRequest & { resolve: (ok: boolean) => void }) | null
  >(null);
  const askConfirm = useCallback(
    (req: ConfirmRequest) =>
      new Promise<boolean>((resolve) => setConfirmReq({ ...req, resolve })),
    [],
  );
  const settleConfirm = useCallback((ok: boolean) => {
    setConfirmReq((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);
  const cancelConfirm = useCallback(() => settleConfirm(false), [settleConfirm]);
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
  }, [canView, orgId]);

  const reloadAfterMutation = useCallback(async () => {
    if (!orgId) return;
    invalidateMerchantIntegrations(orgId);
    await load();
  }, [load, orgId]);

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
    if (!orgId || !canWrite) {
      if (canManage && !liveUnlocked) setError(setupLockHint);
      return;
    }
    if (!keyLabel.trim() || keyScopes.length === 0) return;
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
      await reloadAfterMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create key failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRegisterHook(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canWrite) {
      if (canManage && !liveUnlocked) setError(setupLockHint);
      return;
    }
    if (!hookUrl.trim() || hookEvents.length === 0) return;
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
      await reloadAfterMutation();
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

      <SetupChecklistCard session={session} portal="merchant" />

      {confirmReq ? (
        <ConfirmActionModal
          title={confirmReq.title}
          message={confirmReq.message}
          subject={confirmReq.subject}
          confirmLabel={confirmReq.confirmLabel}
          tone={confirmReq.tone}
          onConfirm={() => settleConfirm(true)}
          onCancel={cancelConfirm}
        />
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
          <SettlementSectionHead
            icon="key"
            title="API keys"
            subtitle="Signed credentials for server-to-server requests."
            help={<CardHelp text={API_KEYS_HELP} />}
          >
            <Budget
              used={keys.length}
              max={MAX_API_KEYS}
              loading={loading}
              title={`Maximum ${MAX_API_KEYS} active API keys`}
            />
          </SettlementSectionHead>
          <div className="plat-settings__card-body">
            {canWrite ? (
              keysAtLimit ? (
                <p className="plat-settings__card-note">
                  Limit reached ({MAX_API_KEYS} active). Revoke an unused key to
                  create another.
                </p>
              ) : (
              <div className="plat-int__form-panel">
                <h3 className="plat-int__section-title">
                  <span className="stl-subhead__icon" aria-hidden>
                    <PlusGlyph />
                  </span>
                  Create API key
                </h3>
                <form className="plat-int__form plat-int__form--cols" onSubmit={onCreateKey}>
                <div className="plat-int__form-col">
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

                <label
                  className="plat-settings__field plat-int__ip-field"
                  htmlFor="key-ip-allowlist"
                >
                  <span>Allowed IP addresses</span>
                  <textarea
                    id="key-ip-allowlist"
                    className="plat-settings__input mono"
                    value={keyIpAllowlist}
                    onChange={(e) => setKeyIpAllowlist(e.target.value)}
                    disabled={busy}
                    rows={4}
                    spellCheck={false}
                    data-gramm="false"
                    placeholder={"203.0.113.10\n198.51.100.0/24"}
                  />
                  <span className="plat-int__field-hint">
                    Optional. One IP address or CIDR range per line.
                  </span>
                </label>
                </div>

                <div className="plat-int__form-col">
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
                    <span className="plat-int__field-hint">
                      Optional. Leave empty for a key that never expires.
                    </span>
                  </label>
                  <button
                    className="btn-primary plat-settings__submit plat-int__generate-btn"
                    type="submit"
                    disabled={busy || !keyLabel.trim() || keyScopes.length === 0}
                  >
                    {SETTLEMENT_ICONS.key}
                    Generate API key
                  </button>
                </div>
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
              <EmptyState
                icon="key"
                title="No API keys yet"
                copy="Create a key to start calling the PaymentGate API from your server."
              />
            ) : (
              <div className="plat-int__list-section">
                <h3 className="plat-int__section-title">Active keys</h3>
                <ul className="plat-int__list">
                {keys.map((k) => (
                  <li key={k.id} className="plat-int__item plat-int__item--key">
                    <div className="plat-int__item-main">
                      <div className="plat-int__item-head">
                        <span className="plat-int__item-icon" aria-hidden>
                          {SETTLEMENT_ICONS.key}
                        </span>
                        <div className="plat-int__item-title">
                          <span className="plat-int__item-name">
                            <strong>{k.label}</strong>
                            <KeyStateBadge expiresAt={k.expiresAt} />
                          </span>
                          <KeyIdCopy keyId={k.keyId} />
                        </div>
                        {canWrite ? (
                          <div className="plat-int__actions">
                            <button
                              type="button"
                              className="btn-ghost btn-tiny"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  !orgId ||
                                  !(await askConfirm({
                                    title: "Rotate API key?",
                                    subject: k.label,
                                    message:
                                      "A new secret is issued and the current one stops working immediately. Update your server before rotating.",
                                    confirmLabel: "Rotate key",
                                    tone: "warn",
                                  }))
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
                                  await reloadAfterMutation();
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
                                  !(await askConfirm({
                                    title: "Revoke API key?",
                                    subject: k.label,
                                    message:
                                      "Requests signed with this key will be rejected right away. This action cannot be undone.",
                                    confirmLabel: "Revoke key",
                                  }))
                                )
                                  return;
                                setBusy(true);
                                try {
                                  await revokeApiKey(k.id, orgId);
                                  await reloadAfterMutation();
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
                          <dd className={k.lastUsedAt ? undefined : "is-muted"}>
                            {k.lastUsedAt
                              ? formatShortTime(k.lastUsedAt)
                              : "Not used yet"}
                          </dd>
                        </div>
                        <div className="plat-int__detail">
                          <dt>Expires</dt>
                          <dd className={k.expiresAt ? undefined : "is-muted"}>
                            {k.expiresAt ? formatShortTime(k.expiresAt) : "Never"}
                          </dd>
                        </div>
                        <div className="plat-int__detail">
                          <dt>Allowed IPs</dt>
                          <dd
                            className={`mono${
                              k.ipAllowlist && k.ipAllowlist.length > 0 ? "" : " is-muted"
                            }`}
                            title={k.ipAllowlist?.join("\n")}
                          >
                            {k.ipAllowlist && k.ipAllowlist.length > 0
                              ? k.ipAllowlist.length > 2
                                ? `${k.ipAllowlist.slice(0, 2).join(", ")} +${
                                    k.ipAllowlist.length - 2
                                  }`
                                : k.ipAllowlist.join(", ")
                              : "Any IP"}
                          </dd>
                        </div>
                      </dl>
                      <div className="plat-int__scopes" aria-label="Permissions">
                        <span className="plat-int__scopes-label">Permissions</span>
                        {k.scopes && k.scopes.length > 0 ? (
                          k.scopes.map((scope) => (
                            <span key={scope} className="plat-int__scope">
                              {scope in KEY_SCOPE_LABELS
                                ? KEY_SCOPE_LABELS[scope as (typeof KEY_SCOPES)[number]]
                                : scope}
                            </span>
                          ))
                        ) : (
                          <span className="plat-int__scopes-none">None</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="plat-settings__card plat-int__card">
          <SettlementSectionHead
            icon="webhook"
            title="Webhooks"
            subtitle="Signed order status notifications to your HTTPS endpoint."
            help={<CardHelp text={WEBHOOKS_HELP} />}
          >
            <Budget
              used={hooks.length}
              max={MAX_WEBHOOKS}
              loading={loading}
              title={`Maximum ${MAX_WEBHOOKS} webhook endpoints`}
            />
          </SettlementSectionHead>
          <div className="plat-settings__card-body">
            {canWrite ? (
              hooksAtLimit ? (
                <p className="plat-settings__card-note">
                  Limit reached ({MAX_WEBHOOKS} endpoints). Delete an unused
                  webhook to add another.
                </p>
              ) : (
              <div className="plat-int__form-panel">
                <h3 className="plat-int__section-title">
                  <span className="stl-subhead__icon" aria-hidden>
                    <PlusGlyph />
                  </span>
                  Add webhook
                </h3>
                <form className="plat-int__form" onSubmit={onRegisterHook}>
                <div className="plat-settings__field">
                  <label className="plat-int__field-label" htmlFor="hook-url">
                    Endpoint URL
                  </label>
                  <div className="plat-int__url-row">
                    <input
                      id="hook-url"
                      className="plat-settings__input mono"
                      value={hookUrl}
                      onChange={(e) => setHookUrl(e.target.value)}
                      required
                      disabled={busy}
                      spellCheck={false}
                      autoComplete="off"
                      data-gramm="false"
                      placeholder="https://example.com/webhooks/paymentgate"
                    />
                    <button
                      className="btn-primary plat-settings__submit plat-int__add-hook-btn"
                      type="submit"
                      disabled={busy || hookEvents.length === 0}
                    >
                      {SETTLEMENT_ICONS.webhook}
                      Add webhook
                    </button>
                  </div>
                  <span className="plat-int__field-hint">
                    HTTPS required. Signed event notifications are posted to this URL.
                  </span>
                </div>

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
                </form>
              </div>
              )
            ) : null}

            {loading && !hasLoaded ? (
              <p className="muted">Loading webhooks…</p>
            ) : hooks.length === 0 ? (
              <EmptyState
                icon="webhook"
                title="No webhooks yet"
                copy="Add an endpoint to receive payment order updates as they happen."
              />
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
                          {canWrite ? (
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
                                    !(await askConfirm({
                                      title: "Rotate signing secret?",
                                      subject: h.url,
                                      message:
                                        "A new secret is issued and the current one stops working immediately. Update your signature verification after rotating.",
                                      confirmLabel: "Rotate secret",
                                      tone: "warn",
                                    }))
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
                                    !(await askConfirm({
                                      title: "Delete webhook?",
                                      subject: h.url,
                                      message:
                                        "Notifications stop immediately and delivery history for this endpoint will no longer be available.",
                                      confirmLabel: "Delete webhook",
                                    }))
                                  )
                                    return;
                                  setBusy(true);
                                  try {
                                    await deleteWebhook(h.id, orgId);
                                    if (selectedHook === h.id) {
                                      setSelectedHook(null);
                                      setDeliveries([]);
                                    }
                                    await reloadAfterMutation();
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
          <SettlementSectionHead
            icon="history"
            title="Delivery history"
            subtitle={<span className="mono plat-int__log-sub">{selectedHookUrl}</span>}
          >
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
          </SettlementSectionHead>
          <div className="plat-settings__card-body">
            {deliveries.length === 0 ? (
              <EmptyState
                icon="history"
                title="No deliveries yet"
                copy="Deliveries for this endpoint will appear here. Use Send test to try it."
              />
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
                      {canWrite ? <th aria-label="Actions" /> : null}
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
                        {canWrite ? (
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
