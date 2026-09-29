import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  cancelOrder,
  type PaymentDetails,
  type PaymentOrder,
  type Session,
} from "../api";
import {
  getMerchantOrder,
  peekMerchantOrder,
  primeMerchantOrder,
} from "../merchantOrderDetail";
import {
  getMerchantOrderPayment,
  peekMerchantOrderPayment,
  primeMerchantOrderPayment,
} from "../merchantOrderPaymentDetails";
import { invalidateMerchantOrdersList } from "../merchantOrdersList";
import { canCancelPendingOrder } from "../orderDetail/orderPermissions";
import { anomalyExplain, orderStatusLabel } from "../orderStatus";
import { AuthToast } from "../../auth/AuthToast";
import { displayNetworkForPair } from "../../shared/assetNetworks";
import { PaymentQrCanvas } from "../../shared/PaymentQrCanvas";
import { SharePayLink } from "../../shared/SharePayLink";
import { merchantRoute } from "../../shared/portalRouting";
import { serverNow } from "../../shared/serverClock";
import { AssetIcon, NetworkIcon, QrCenterNetworkMark } from "../../platform/cryptoIcons";
import { paymentPhase, receiptRows, receiptText, type ReceiptInput } from "./cashierLogic";
import { holdCashierIdle } from "./cashierIdle";

type Props = { session: Session };

const POLL_MS = 3000;

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Cashier live payment — big QR for the customer, status steps for the cashier. */
export function LivePaymentPage({ session }: Props) {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const seededPay = (location.state as { pay?: PaymentDetails | null } | null)?.pay ?? null;

  const [order, setOrder] = useState<PaymentOrder | null>(() => peekMerchantOrder(orderId));
  const [pay, setPay] = useState<PaymentDetails | null>(
    () => seededPay ?? peekMerchantOrderPayment(orderId),
  );
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [customerView, setCustomerView] = useState(false);
  const [qrMode, setQrMode] = useState<"with_amount" | "address_only">("with_amount");
  const [, setTick] = useState(0);

  const refresh = useCallback(
    async (force: boolean) => {
      if (!orderId) return;
      try {
        const [o, p] = await Promise.all([
          getMerchantOrder(orderId, { force }),
          getMerchantOrderPayment(orderId, { force }).catch(() => null),
        ]);
        primeMerchantOrder(orderId, o);
        setOrder(o);
        if (p) {
          primeMerchantOrderPayment(orderId, p);
          setPay(p);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load this order");
      }
    },
    [orderId],
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const status = order?.status ?? pay?.status;
  const phase = paymentPhase(status);
  const live = phase === "waiting" || phase === "confirming";

  useEffect(() => {
    if (!live) return;
    const poll = window.setInterval(() => void refresh(true), POLL_MS);
    const tick = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [live, refresh]);

  useEffect(() => {
    if (!live) invalidateMerchantOrdersList();
  }, [live]);

  useEffect(() => (live ? holdCashierIdle() : undefined), [live]);

  const toggleCustomerView = async () => {
    const next = !customerView;
    setCustomerView(next);
    try {
      if (next && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      /* fullscreen is optional (iOS Safari, kiosk browsers) */
    }
  };

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setCustomerView(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function cancel() {
    if (!order) return;
    setCancelling(true);
    try {
      const next = await cancelOrder(order.id, { note: "Cancelled at cashier terminal" });
      primeMerchantOrder(order.id, next);
      setOrder(next);
      invalidateMerchantOrdersList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel this order");
    } finally {
      setCancelling(false);
    }
  }

  if (!order && !pay) {
    return (
      <div className="cashier-live cashier-live--loading">
        <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
        <p className="muted">{error ? "Order unavailable." : "Loading payment…"}</p>
        <Link className="btn-ghost" to={merchantRoute("charge")}>
          Back to Charge
        </Link>
      </div>
    );
  }

  const asset = pay?.asset ?? order?.asset ?? "";
  const network = pay?.network ?? order?.network ?? "";
  const payable = pay?.payableAmount.amount ?? order?.payableAmount.amount ?? "";
  const invoiceAmount = order?.invoiceAmount ?? pay?.invoiceAmountUsd;
  const invoiceCurrency = order?.invoiceCurrency ?? pay?.invoiceCurrency ?? "USD";
  const expiresAt = pay?.expiresAt ?? order?.expiresAt;
  const remainingMs = expiresAt ? Date.parse(expiresAt) - serverNow() : 0;
  const receiveAddress = pay?.receiveAddress ?? "";
  const addressOnly = qrMode === "address_only" && Boolean(receiveAddress);
  const qrValue = addressOnly ? receiveAddress : (pay?.qrPayload ?? "");
  const confirmations = pay?.confirmations ?? 0;
  const required = pay?.requiredConfirmations ?? 0;
  const orderNumber = order?.orderNumber ?? pay?.orderNumber ?? "";
  const canCancel = canCancelPendingOrder(session, order);
  const receipt: ReceiptInput = {
    merchantName: pay?.merchantName ?? order?.orgName,
    orderNumber,
    paidAt: pay?.confirmedAt,
    invoiceAmount: invoiceAmount ?? null,
    invoiceCurrency,
    cryptoAmount: order?.receivedAmount?.amount ?? payable,
    asset,
    networkLabel: displayNetworkForPair(asset, network),
    txHash: pay?.txHash,
    reference: order?.merchantReference,
    timeZone: pay?.businessTimezone ?? order?.businessTimezone,
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareReceipt = async () => {
    try {
      await navigator.share({ title: `Receipt #${orderNumber}`, text: receiptText(receipt) });
    } catch {
      /* dismissed */
    }
  };
  const explain =
    phase === "attention" && order
      ? anomalyExplain({
          reason: order.anomalyReason,
          matchingMode: order.matchingMode,
          payableAmount: order.payableAmount?.amount,
          receivedAmount: order.receivedAmount?.amount,
          hasTx: Boolean(order.receivedAmount?.amount),
        })
      : null;

  return (
    <div className={`cashier-live cashier-live--${phase}${customerView ? " is-customer-view" : ""}`}>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <section className="cashier-live__customer" aria-label="Customer payment">
        {invoiceAmount ? (
          <p className="cashier-live__invoice">
            {invoiceAmount} {invoiceCurrency}
          </p>
        ) : null}
        <p className="cashier-live__payable fund-amount">
          {payable} <span>{asset}</span>
        </p>
        <p className="cashier-live__rail">
          <AssetIcon asset={asset} /> <NetworkIcon network={network} />{" "}
          {asset} on {displayNetworkForPair(asset, network)} only
        </p>

        {phase === "waiting" && pay?.qrPayload ? (
          <div className="cashier-live__qr">
            {receiveAddress ? (
              <div className="cashier-live__qr-mode" role="group" aria-label="QR type">
                <button
                  type="button"
                  className={`cashier-live__qr-mode-btn${addressOnly ? "" : " is-active"}`}
                  aria-pressed={!addressOnly}
                  onClick={() => setQrMode("with_amount")}
                >
                  With amount
                </button>
                <button
                  type="button"
                  className={`cashier-live__qr-mode-btn${addressOnly ? " is-active" : ""}`}
                  aria-pressed={addressOnly}
                  onClick={() => setQrMode("address_only")}
                >
                  Address only
                </button>
              </div>
            ) : null}
            <div className="cashier-live__qr-frame">
              <PaymentQrCanvas
                payload={qrValue}
                size={420}
                alt={addressOnly ? "Receive address QR code" : "Scan to pay"}
              />
              <span className="cashier-live__qr-mark" aria-hidden>
                <QrCenterNetworkMark network={network} />
              </span>
            </div>
            <p>
              {addressOnly
                ? `Address only — customer enters exactly ${payable} ${asset} in their wallet`
                : "Scan with your phone camera or wallet app"}
            </p>
          </div>
        ) : null}

        {phase === "confirming" ? (
          <div className="cashier-live__state">
            <span className="cashier-live__spinner" aria-hidden />
            <strong>Payment detected</strong>
            <p>
              {required > 0
                ? `Confirming on-chain · ${confirmations}/${required}`
                : "Confirming on-chain…"}
            </p>
          </div>
        ) : null}

        {phase === "paid" ? (
          <div className="cashier-live__state cashier-live__state--paid">
            <span className="cashier-live__check" aria-hidden>
              ✓
            </span>
            <strong>Payment complete</strong>
            <p>Thank you!</p>
          </div>
        ) : null}

        {phase === "attention" ? (
          <div className="cashier-live__state cashier-live__state--attention">
            <strong>{explain?.title ?? "Payment needs review"}</strong>
            <p>Please wait — staff will check this payment.</p>
          </div>
        ) : null}

        {phase === "closed" ? (
          <div className="cashier-live__state cashier-live__state--closed">
            <strong>{orderStatusLabel(status, order)}</strong>
            <p>This QR is no longer valid.</p>
          </div>
        ) : null}

        {phase === "waiting" && expiresAt ? (
          <p className="cashier-live__timer" aria-live="off">
            Expires in {formatClock(remainingMs)}
          </p>
        ) : null}
      </section>

      <aside className="cashier-live__staff" aria-label="Cashier controls">
        <p className="cashier-live__order">Order #{orderNumber}</p>
        <ol className="cashier-live__steps">
          <li className={phase === "waiting" ? "is-current" : "is-done"}>
            Waiting for payment
          </li>
          <li
            className={
              phase === "confirming"
                ? "is-current"
                : phase === "paid"
                  ? "is-done"
                  : ""
            }
          >
            Detected · confirming
          </li>
          <li className={phase === "paid" ? "is-done is-current" : ""}>Paid</li>
        </ol>

        {phase === "waiting" && pay?.paymentPageUrl ? (
          <SharePayLink
            className="cashier-live__share"
            url={pay.paymentPageUrl}
            amountLabel={
              invoiceAmount && order?.invoiceDenomination !== "crypto"
                ? `${invoiceAmount} ${invoiceCurrency}`
                : `${payable} ${asset}`
            }
            merchantName={pay.merchantName ?? order?.orgName}
            expiresAt={expiresAt}
            timeZone={pay.businessTimezone ?? order?.businessTimezone}
          />
        ) : null}

        {phase === "attention" ? (
          <p className="cashier-live__note">
            Ask a manager to review this order before completing the sale — they can
            resolve it from the order page.
          </p>
        ) : null}

        <div className="cashier-live__actions">
          {phase === "paid" ? (
            <div className="cashier-live__receipt-actions">
              <button type="button" className="btn-ghost" onClick={() => window.print()}>
                Print receipt
              </button>
              {canShare ? (
                <button type="button" className="btn-ghost" onClick={() => void shareReceipt()}>
                  Share receipt
                </button>
              ) : null}
            </div>
          ) : null}
          {phase === "waiting" ? (
            <button type="button" className="btn-ghost" onClick={() => void toggleCustomerView()}>
              {customerView ? "Exit customer view" : "Customer view"}
            </button>
          ) : null}
          <Link className="btn-ghost" to={merchantRoute(`orders/${orderId}`)}>
            Order details
          </Link>
          {canCancel ? (
            <button
              type="button"
              className="btn-ghost cashier-live__cancel"
              disabled={cancelling}
              onClick={() => void cancel()}
            >
              {cancelling ? "Cancelling…" : "Cancel order"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary cashier-live__next"
            onClick={() => navigate(merchantRoute("charge"))}
          >
            {live ? "New sale (keep this open)" : "New sale"}
          </button>
        </div>
      </aside>

      {phase === "paid" ? (
        <section className="cashier-receipt" aria-hidden>
          <h2>{receipt.merchantName?.trim() || "Payment receipt"}</h2>
          <p className="cashier-receipt__kicker">Payment receipt</p>
          <dl>
            {receiptRows(receipt).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="cashier-receipt__foot">Thank you!</p>
        </section>
      ) : null}

      {customerView ? (
        <button
          type="button"
          className="cashier-live__exit-customer"
          onClick={() => void toggleCustomerView()}
        >
          Exit
        </button>
      ) : null}
    </div>
  );
}
