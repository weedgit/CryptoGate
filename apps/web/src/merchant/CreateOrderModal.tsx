import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { OnboardWizardBrandHead } from "../shared/onboardMerchantUi";
import { ClockIcon, LockIcon, TagIcon } from "../auth/LoginIcons";
import { formatShortTime, orderStatusLabel } from "./orderStatus";

const CREATE_ORDER_TITLE = "Create payment order";
const CREATE_ORDER_SUBTITLE =
  "Set the amount and network — the customer pays from the order page.";

function InvoiceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 2.75h12a1 1 0 0 1 1 1V21l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21V3.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9 8h6M9 11.5h6M9 15h3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Props = {
  onClose: () => void;
  /** Merchant default matching mode (read-only on create). */
  matchingMode?: string;
  /** Contact verification still pending — do not create. */
  locked?: boolean;
  /** Active workspace org the order is created for. */
  orgId?: string | null;
};

export type BlockingOrderInfo = {
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

type ChargeId = "USD" | "EUR" | "TOKEN";

const FIAT_SYMBOL: Record<"USD" | "EUR", string> = { USD: "$", EUR: "€" };

/** Currency symbol for the pay-with token (₮ USDT, Ξ ETH, …). */
export function tokenSymbol(asset: string): string {
  switch (asset) {
    case "USDT":
      return "₮";
    case "ETH":
      return "Ξ";
    default:
      return asset.slice(0, 1);
  }
}

const MODE_B_BLOCK_CLEAR_STATUSES = new Set([
  "completed",
  "expired",
  "failed",
  "cancelled",
]);

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

export function parseBlockingOrder(details: unknown): BlockingOrderInfo | null {
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

export function CreateOrderModal({
  onClose,
  matchingMode = "B",
  locked = false,
  orgId,
}: Props) {
  const navigate = useNavigate();
  const initial = defaultLivePair();
  const [amount, setAmount] = useState("");
  const [denomination, setDenomination] = useState<"fiat" | "crypto">("fiat");
  const [invoiceCurrency, setInvoiceCurrency] = useState<"USD" | "EUR">("USD");
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

  const charge: ChargeId = denomination === "crypto" ? "TOKEN" : invoiceCurrency;
  const chargeOptions: { id: ChargeId; symbol: ReactNode; label: string }[] = [
    { id: "USD", symbol: FIAT_SYMBOL.USD, label: "USD" },
    { id: "EUR", symbol: FIAT_SYMBOL.EUR, label: "EUR" },
    { id: "TOKEN", symbol: <AssetIcon asset={asset} />, label: asset },
  ];
  const chargeCode = charge === "TOKEN" ? asset : invoiceCurrency;
  const chargeSymbol =
    charge === "TOKEN" ? tokenSymbol(asset) : FIAT_SYMBOL[invoiceCurrency];
  const lockMinutes = Math.round(validitySeconds / 60);
  const typedAmount = amount.trim() ? formatPreviewAmount(amount) : null;
  const payHint =
    charge === "TOKEN"
      ? typedAmount
        ? `Customer pays exactly ${typedAmount} ${asset}.`
        : `Customer pays exactly this ${asset} amount.`
      : typedAmount
        ? `Customer pays ${chargeSymbol}${typedAmount} worth of ${asset} at the live rate, locked for ${lockMinutes} min.`
        : `Customer pays the ${asset} equivalent at the live rate, locked for ${lockMinutes} min.`;

  function selectCharge(id: ChargeId) {
    if (id === "TOKEN") {
      setDenomination("crypto");
      return;
    }
    setDenomination("fiat");
    setInvoiceCurrency(id);
  }

  const modeLabel = matchingModeLabel(matchingMode);
  const modeSummary = matchingModeCreateSummary(matchingMode);
  const modePayerNote =
    matchingMode === "C"
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
        ...(denomination === "crypto"
          ? { amountCrypto: trimmed, invoiceDenomination: "crypto" }
          : {
              amountUsd: trimmed,
              invoiceAmount: trimmed,
              invoiceCurrency,
              invoiceDenomination: "fiat",
            }),
        asset,
        network,
        validitySeconds,
        merchantReference: merchantReference.trim() || undefined,
        orgId,
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

  const previewReference = merchantReference.trim();
  const formLocked = Boolean(amountLock && !amountLock.cleared);
  if (locked) {
    return createPortal(
      <div
        className="b4-wizard-portal create-order-modal-backdrop"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="b4-wizard create-order-modal create-order-modal--locked"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-order-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <OnboardWizardBrandHead
            titleId="create-order-modal-title"
            title={CREATE_ORDER_TITLE}
            subtitle={CREATE_ORDER_SUBTITLE}
            onClose={onClose}
            icon={<InvoiceIcon />}
          />
          <div className="b4-wizard__body">
            <p className="muted">
              Verify email and phone before creating an order. Use the banner at
              the top of the page.
            </p>
          </div>
          <footer className="b4-wizard__foot">
            <button type="button" className="b4-wizard__cancel" onClick={onClose}>
              Close
            </button>
          </footer>
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <>
      <AuthToast
        message={error}
        tone="error"
        onDismiss={() => setError(null)}
      />
      <div
      className="b4-wizard-portal create-order-modal-backdrop"
      role="presentation"
      onClick={requestClose}
    >
      <div
        className="b4-wizard create-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-order-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <OnboardWizardBrandHead
          titleId="create-order-modal-title"
          title={CREATE_ORDER_TITLE}
          subtitle={CREATE_ORDER_SUBTITLE}
          onClose={requestClose}
          closeDisabled={loading}
          icon={<InvoiceIcon />}
        />

        <div className="create-order-modal__body">
          <div className="create-order-modal__layout">
            <form
              id="create-order-form"
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

              <div className="profile-settings-card__grid">
                <label className="plat-settings__field" htmlFor="create-asset">
                  <span>Customer pays with</span>
                  <FieldControl leading={<AssetIcon asset={asset} />}>
                    <SearchableSelect
                      id="create-asset"
                      value={asset}
                      options={assetSelectOptions}
                      onChange={onAssetChange}
                      allowEmpty={false}
                      disabled={loading}
                      ariaLabel="Customer pays with"
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

              <div className="plat-settings__field">
                <span id="create-charge-label">Charge in</span>
                <div
                  className="create-order-charge"
                  role="radiogroup"
                  aria-labelledby="create-charge-label"
                >
                  {chargeOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={charge === opt.id}
                      className={`create-order-charge__btn${charge === opt.id ? " is-active" : ""}`}
                      disabled={loading || formLocked}
                      onClick={() => selectCharge(opt.id)}
                    >
                      <span className="create-order-charge__symbol" aria-hidden="true">
                        {opt.symbol}
                      </span>
                      <span className="create-order-charge__code">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="plat-settings__field" htmlFor="create-amount">
                <span>Amount</span>
                <FieldControl
                  leading={
                    <span className="create-order-amount__symbol" aria-hidden="true">
                      {chargeSymbol}
                    </span>
                  }
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
                    aria-describedby={
                      amountError ? "create-amount-error" : "create-amount-payhint"
                    }
                  />
                  <span className="create-order-amount__asset" aria-hidden="true">
                    {chargeCode}
                  </span>
                </FieldControl>
                {amountError ? (
                  <p className="field-error" id="create-amount-error">
                    {amountError}
                  </p>
                ) : (
                  <p className="create-order-amount__payhint" id="create-amount-payhint">
                    {payHint}
                  </p>
                )}
              </label>

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
            </form>

            <aside
              className="create-order-page__preview create-order-confirm"
              aria-label="Confirm order"
            >
              <h2 className="create-order-page__preview-title">Confirm</h2>
              <div className="create-order-confirm__card">
                <div className="create-order-confirm__hero">
                  <p className="create-order-confirm__eyebrow">Customer is charged</p>
                  <p
                    className={`create-order-confirm__amount fund-amount${
                      typedAmount ? "" : " is-empty"
                    }`}
                  >
                    <span className="create-order-confirm__symbol">{chargeSymbol}</span>
                    {typedAmount ?? "0.00"}
                  </p>
                  <p className="create-order-confirm__code">{chargeCode}</p>
                  <p className="create-order-confirm__pays">
                    <AssetIcon asset={asset} />
                    {charge === "TOKEN"
                      ? `Exact ${asset} amount`
                      : `Paid in ${asset} at live rate`}
                  </p>
                </div>

                <dl className="create-order-confirm__rows">
                  <div className="create-order-confirm__row">
                    <dt>
                      <span className="create-order-confirm__icon">
                        <NetworkIcon network={network} />
                      </span>
                      Network
                    </dt>
                    <dd>{guestLabel}</dd>
                  </div>
                  <div className="create-order-confirm__row">
                    <dt>
                      <span className="create-order-confirm__icon">
                        <ClockIcon />
                      </span>
                      Valid for
                    </dt>
                    <dd>{lockMinutes} min</dd>
                  </div>
                  <div className="create-order-confirm__row">
                    <dt>
                      <span className="create-order-confirm__icon">
                        <LockIcon />
                      </span>
                      Matching
                    </dt>
                    <dd>{modeLabel}</dd>
                  </div>
                  {previewReference ? (
                    <div className="create-order-confirm__row">
                      <dt>
                        <span className="create-order-confirm__icon">
                          <TagIcon />
                        </span>
                        Reference
                      </dt>
                      <dd className="create-order-confirm__ref">{previewReference}</dd>
                    </div>
                  ) : null}
                </dl>

                <p className="create-order-confirm__note">
                  Payment address and QR code are generated when you create the
                  order.
                  {previewReference
                    ? " Reference is for staff only — not shown to the customer."
                    : null}
                </p>
              </div>
            </aside>
          </div>
        </div>

        <footer className="b4-wizard__foot">
          <div className="b4-wizard__foot-left">
            <button
              type="button"
              className="b4-wizard__cancel"
              disabled={loading}
              onClick={requestClose}
            >
              Cancel
            </button>
          </div>
          <button
            type="submit"
            form="create-order-form"
            className="b4-wizard__continue b4-wizard__continue--gold"
            disabled={loading || !amount.trim() || formLocked}
          >
            {loading ? (
              <>
                <span className="cg-spinner cg-spinner--xs" aria-hidden />
                Creating…
              </>
            ) : formLocked ? (
              "Waiting on first order"
            ) : (
              <>
                Create payment order
                <span aria-hidden>→</span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
    </>,
    document.body,
  );
}
