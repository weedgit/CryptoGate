import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { invalidateMerchantOrdersList } from "./merchantOrdersList";
import { primeMerchantOrder } from "./merchantOrderDetail";
import { primeMerchantOrderPayment } from "./merchantOrderPaymentDetails";
import {
  ApiError,
  createOrder,
  getOrder,
  getPaymentDetails,
} from "./api";
import {
  matchingModeCreateSummary,
  matchingModeHint,
  matchingModeLabel,
  VALIDITY_OPTIONS,
} from "./matchingLabels";
import {
  defaultLivePair,
  displayNetworkForPair,
  isLivePair,
  pairSelectLabel,
  pairsForAsset,
  uniqueAssetsFromRegistry,
} from "../shared/assetNetworks";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { formatShortTime, orderStatusLabel } from "./orderStatus";

type Props = {
  onClose: () => void;
  /** Merchant default matching mode (read-only on create). */
  matchingMode?: string;
};

type BlockingOrderInfo = {
  id: string;
  orderNumber: string;
  status: string;
  payableAmount: string;
  asset: string;
  network: string;
  createdAt?: string | null;
  createdByEmail?: string | null;
  createdByLabel: string;
};

const MODE_B_BLOCK_CLEAR_STATUSES = new Set([
  "completed",
  "expired",
  "failed",
  "cancelled",
]);

function formatPreviewTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:00`;
}

function formatPreviewAmount(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "—";
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return trimmed;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

/** Digits and at most one decimal separator — matches API amount format. */
function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return (
    cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "")
  );
}

function parseBlockingOrder(details: unknown): BlockingOrderInfo | null {
  if (!details || typeof details !== "object") return null;
  const blocking = (details as { blockingOrder?: Record<string, unknown> })
    .blockingOrder;
  if (!blocking || typeof blocking !== "object") return null;
  const id = typeof blocking.id === "string" ? blocking.id : "";
  const orderNumber =
    typeof blocking.orderNumber === "string" ? blocking.orderNumber : "";
  if (!id || !orderNumber) return null;
  return {
    id,
    orderNumber,
    status: typeof blocking.status === "string" ? blocking.status : "pending_payment",
    payableAmount:
      typeof blocking.payableAmount === "string" ? blocking.payableAmount : "",
    asset: typeof blocking.asset === "string" ? blocking.asset : "",
    network: typeof blocking.network === "string" ? blocking.network : "",
    createdAt:
      typeof blocking.createdAt === "string" ? blocking.createdAt : null,
    createdByEmail:
      typeof blocking.createdByEmail === "string"
        ? blocking.createdByEmail
        : null,
    createdByLabel:
      typeof blocking.createdByLabel === "string"
        ? blocking.createdByLabel
        : typeof blocking.createdByEmail === "string"
          ? blocking.createdByEmail
          : "another cashier",
  };
}

export function CreateOrderModal({ onClose, matchingMode = "B" }: Props) {
  const navigate = useNavigate();
  const initial = defaultLivePair();
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<string>(initial.asset);
  const [network, setNetwork] = useState<string>(initial.network);
  const [validitySeconds, setValiditySeconds] = useState(1800);
  const [merchantReference, setMerchantReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [amountLock, setAmountLock] = useState<{
    message: string;
    blocking: BlockingOrderInfo;
    cleared: boolean;
  } | null>(null);

  const assets = useMemo(
    () =>
      uniqueAssetsFromRegistry().filter((a) =>
        pairsForAsset(a).some((p) => p.enabled),
      ),
    [],
  );
  const networkRows = useMemo(
    () => pairsForAsset(asset).filter((p) => p.enabled),
    [asset],
  );

  useEffect(() => {
    if (networkRows.length === 0) return;
    if (!networkRows.some((row) => row.network === network)) {
      setNetwork(networkRows[0]!.network);
    }
  }, [network, networkRows]);

  const assetSelectOptions = useMemo(
    () =>
      assets.map((a) => ({
        id: a,
        label: a,
        icon: <AssetIcon asset={a} />,
      })),
    [assets],
  );
  const networkSelectOptions = useMemo(
    () =>
      networkRows.map((row) => ({
        id: row.network,
        label: pairSelectLabel(row),
        icon: <NetworkIcon network={row.network} />,
      })),
    [networkRows],
  );
  const validitySelectOptions = useMemo(
    () =>
      VALIDITY_OPTIONS.map((o) => ({
        id: String(o.seconds),
        label: o.label,
      })),
    [],
  );
  const guestLabel = displayNetworkForPair(asset, network);

  const modeLabel = matchingModeLabel(matchingMode);
  const modeSummary = matchingModeCreateSummary(matchingMode);
  const modePayerNote =
    matchingMode === "C" || matchingMode === "D"
      ? matchingModeHint(matchingMode)
      : matchingMode === "B"
        ? matchingModeHint("B")
        : null;

  const requestClose = useCallback(() => {
    if (!loading) onClose();
  }, [loading, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  useEffect(() => {
    if (!amountLock || amountLock.cleared) return;
    const blockingId = amountLock.blocking.id;
    let cancelled = false;

    async function poll() {
      try {
        const order = await getOrder(blockingId);
        if (cancelled) return;
        if (MODE_B_BLOCK_CLEAR_STATUSES.has(order.status)) {
          setAmountLock((prev) =>
            prev && prev.blocking.id === blockingId
              ? {
                  ...prev,
                  cleared: true,
                  blocking: { ...prev.blocking, status: order.status },
                }
              : prev,
          );
          return;
        }
        setAmountLock((prev) =>
          prev && prev.blocking.id === blockingId
            ? {
                ...prev,
                blocking: { ...prev.blocking, status: order.status },
              }
            : prev,
        );
      } catch {
        // Keep waiting — order may be temporarily unreadable.
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [amountLock?.blocking.id, amountLock?.cleared]);

  function onAssetChange(nextAsset: string) {
    setAsset(nextAsset);
    const live = pairsForAsset(nextAsset).find((p) => p.enabled);
    if (live) setNetwork(live.network);
  }

  async function submitCreate() {
    const trimmed = amount.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
      setAmountError("Enter an amount greater than zero.");
      return;
    }
    if (!isLivePair(asset, network)) {
      setError("Asset and network are not enabled for this environment.");
      return;
    }
    setAmountError(null);
    setLoading(true);
    setError(null);
    try {
      const order = await createOrder({
        amount: trimmed,
        asset,
        network,
        validitySeconds,
        merchantReference: merchantReference.trim() || undefined,
      });
      invalidateMerchantOrdersList();
      primeMerchantOrder(order.id, order);
      const pay = await getPaymentDetails(order.id);
      primeMerchantOrderPayment(order.id, pay);
      setAmountLock(null);
      onClose();
      navigate(merchantRoute(`orders/${order.id}`), {
        replace: false,
        state: { pay },
      });
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "mode_b_amount_in_use" || err.code === "mode_d_memo_in_use")
      ) {
        const blocking = parseBlockingOrder(err.details);
        if (blocking) {
          setAmountLock({
            message: err.message,
            blocking,
            cleared: false,
          });
          setError(null);
          return;
        }
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create payment order";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (amountLock && !amountLock.cleared) return;
    await submitCreate();
  }

  const previewAmount = formatPreviewAmount(amount);
  const previewReference = merchantReference.trim();
  const formLocked = Boolean(amountLock && !amountLock.cleared);
  return createPortal(
    <>
      <AuthToast
        message={error}
        tone="error"
        onDismiss={() => setError(null)}
      />
      <div
      className="b3-commission-modal-backdrop create-order-modal-backdrop"
      role="presentation"
      onClick={requestClose}
    >
      <div
        className="b3-commission-modal create-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-order-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head">
          <h3 id="create-order-modal-title">CREATE PAYMENT ORDER</h3>
          <button
            type="button"
            className="b3-commission-modal__close create-order-modal__close"
            aria-label="Close"
            disabled={loading}
            onClick={requestClose}
          >
            ×
          </button>
        </header>

        <div className="b3-commission-modal__body create-order-modal__body">
          <div className="create-order-modal__layout">
            <form
              className="plat-settings plat-settings--merchant create-order-modal__form"
              onSubmit={onSubmit}
              noValidate
            >
              {amountLock ? (
                <aside
                  className={`create-order-amount-lock${
                    amountLock.cleared ? " is-cleared" : ""
                  }`}
                  role="alert"
                >
                  <strong>
                    {amountLock.cleared
                      ? "Amount slot is free"
                      : "Same amount already open"}
                  </strong>
                  <p>{amountLock.message}</p>
                  <dl className="create-order-amount-lock__meta">
                    <div>
                      <dt>First order</dt>
                      <dd>
                        <Link
                          to={merchantRoute(`orders/${amountLock.blocking.id}`)}
                          onClick={onClose}
                        >
                          #{amountLock.blocking.orderNumber}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt>Created by</dt>
                      <dd>{amountLock.blocking.createdByLabel}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{orderStatusLabel(amountLock.blocking.status)}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatShortTime(amountLock.blocking.createdAt)}</dd>
                    </div>
                  </dl>
                  {!amountLock.cleared ? (
                    <>
                      <p className="create-order-amount-lock__wait">
                        Waiting until #{amountLock.blocking.orderNumber} is
                        completed, cancelled, or expired…
                      </p>
                      <p className="create-order-amount-lock__hint">
                        Open that order to cancel if it is still pending.
                        Cashiers can cancel only their own tickets — otherwise
                        ask Owner/Administrator.
                      </p>
                      <Link
                        className="btn-primary create-order-amount-lock__continue"
                        to={merchantRoute(`orders/${amountLock.blocking.id}`)}
                        onClick={onClose}
                      >
                        Open first order
                      </Link>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary create-order-amount-lock__continue"
                      disabled={loading}
                      onClick={() => void submitCreate()}
                    >
                      {loading ? "Creating…" : "Continue"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="create-order-amount-lock__dismiss"
                    disabled={loading}
                    onClick={() => setAmountLock(null)}
                  >
                    Change amount instead
                  </button>
                </aside>
              ) : null}

              <label className="plat-settings__field" htmlFor="create-amount">
                <span>Payment amount</span>
                <FieldControl
                  icon="coins"
                  invalid={!!amountError}
                  shellClassName="field-shell--amount-suffix"
                >
                  <input
                    id="create-amount"
                    className="plat-settings__input create-order-amount__input fund-amount"
                    value={amount}
                    onChange={(e) => {
                      setAmount(sanitizeAmountInput(e.target.value));
                      if (amountError) setAmountError(null);
                      if (amountLock) setAmountLock(null);
                    }}
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={loading || formLocked}
                    autoComplete="off"
                    aria-invalid={amountError ? true : undefined}
                    aria-describedby={amountError ? "create-amount-error" : undefined}
                  />
                  <span className="create-order-amount__asset" aria-hidden="true">
                    {asset}
                  </span>
                </FieldControl>
                {amountError ? (
                  <p className="field-error" id="create-amount-error">
                    {amountError}
                  </p>
                ) : null}
              </label>

              <div className="profile-settings-card__grid">
                <label className="plat-settings__field" htmlFor="create-asset">
                  <span>Asset</span>
                  <FieldControl leading={<AssetIcon asset={asset} />}>
                    <SearchableSelect
                      id="create-asset"
                      value={asset}
                      options={assetSelectOptions}
                      onChange={onAssetChange}
                      allowEmpty={false}
                      disabled={loading}
                      ariaLabel="Asset"
                      hideTriggerIcon
                    />
                  </FieldControl>
                </label>
                <label className="plat-settings__field" htmlFor="create-network">
                  <span>Network</span>
                  <FieldControl leading={<NetworkIcon network={network} />}>
                    <SearchableSelect
                      id="create-network"
                      value={network}
                      options={networkSelectOptions}
                      onChange={setNetwork}
                      allowEmpty={false}
                      disabled={loading}
                      ariaLabel="Network"
                      hideTriggerIcon
                    />
                  </FieldControl>
                </label>
              </div>

              <label className="plat-settings__field" htmlFor="create-reference">
                <span>Merchant reference (optional)</span>
                <FieldControl icon="tag">
                  <input
                    id="create-reference"
                    className="plat-settings__input"
                    value={merchantReference}
                    onChange={(e) => setMerchantReference(e.target.value)}
                    maxLength={200}
                    placeholder="Optional reference"
                    disabled={loading}
                    autoComplete="off"
                  />
                </FieldControl>
              </label>

              <label className="plat-settings__field" htmlFor="create-validity">
                <span>Valid for</span>
                <FieldControl icon="clock">
                  <SearchableSelect
                    id="create-validity"
                    value={String(validitySeconds)}
                    options={validitySelectOptions}
                    onChange={(id) => setValiditySeconds(Number(id))}
                    allowEmpty={false}
                    disabled={loading}
                    ariaLabel="Valid for"
                  />
                </FieldControl>
              </label>

              <div className="create-order-page__matching">
                <div className="create-order-page__matching-head">
                  <span className="create-order-page__matching-label">
                    Matching mode
                  </span>
                  <span className="create-order-page__matching-value">
                    {modeLabel}
                  </span>
                </div>
                <p className="create-order-page__matching-copy">{modeSummary}</p>
                {modePayerNote ? (
                  <p className="create-order-page__matching-note">{modePayerNote}</p>
                ) : null}
                <Link
                  className="plat-settings__nav-link"
                  to={merchantRoute("settings/settlement")}
                  onClick={onClose}
                >
                  Change in settlement settings
                </Link>
              </div>

              <div className="profile-settings-card__actions">
                <button
                  type="submit"
                  className="plat-settings__save create-order-modal__submit"
                  disabled={loading || !amount.trim() || formLocked}
                >
                  {loading
                    ? "CREATING…"
                    : formLocked
                      ? "WAITING ON FIRST ORDER"
                      : "CREATE PAYMENT ORDER"}
                </button>
              </div>
            </form>

            <aside className="create-order-page__preview" aria-label="Preview">
              <h2 className="create-order-page__preview-title">Preview</h2>
              <div className="create-order-preview-card">
                <div className="create-order-preview-card__bar">
                  <span className="create-order-preview-card__brand">CryptoGate</span>
                  <span className="create-order-preview-card__timer">
                    {formatPreviewTimer(validitySeconds)}
                  </span>
                </div>
                <div className="create-order-preview-card__amount">
                  <p className="create-order-preview-card__amount-label">
                    Amount to send
                  </p>
                  <p className="create-order-preview-card__amount-value fund-amount">
                    {previewAmount}{" "}
                    <span className="create-order-preview-card__amount-unit">
                      {asset}
                    </span>
                  </p>
                </div>
                <p className="create-order-preview-card__network">
                  {asset} · {guestLabel}
                </p>
                <div className="create-order-preview-card__qr" aria-hidden="true">
                  <svg
                    className="create-order-preview-card__qr-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="14" y="14" width="3" height="3" fill="currentColor" />
                    <rect x="18" y="14" width="3" height="3" fill="currentColor" />
                    <rect x="14" y="18" width="3" height="3" fill="currentColor" />
                    <rect x="18" y="18" width="3" height="3" fill="currentColor" />
                  </svg>
                  <span>QR code appears on the order page</span>
                </div>
                <div className="create-order-preview-card__address">
                  <p className="create-order-preview-card__address-label">
                    Payment address
                  </p>
                  <p className="create-order-preview-card__address-value">
                    Assigned when the order is created
                  </p>
                </div>
              </div>
              {previewReference ? (
                <p className="create-order-page__ref-note">
                  <span className="create-order-page__ref-note-label">
                    Merchant reference
                  </span>
                  <span className="create-order-page__ref-note-value">
                    {previewReference}
                  </span>
                  <span className="create-order-page__ref-note-hint">
                    Cashier & order detail only — not on payer page
                  </span>
                </p>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </div>
    </>,
    document.body,
  );
}
