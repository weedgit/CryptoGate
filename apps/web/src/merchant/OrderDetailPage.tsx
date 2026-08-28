import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ApiError,
  getOnChain,
  getOrder,
  getPaymentDetails,
  type OnChainDetails,
  type PaymentDetails,
  type PaymentOrder,
} from "./api";
import { matchingModeLabel } from "./matchingLabels";
import {
  confirmationProgress,
  formatExpiryRemaining,
  formatShortTime,
  anomalyReasonLabel,
  orderStatusLabel,
  orderStatusTone,
} from "./orderStatus";
import { networkLabel } from "./org";
import { StatusBadge } from "../shared/StatusBadge";

export function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const seededPay = (location.state as { pay?: PaymentDetails } | null)?.pay;

  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [pay, setPay] = useState<PaymentDetails | null>(seededPay ?? null);
  const [chain, setChain] = useState<OnChainDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [o, p, c] = await Promise.all([
        getOrder(id),
        getPaymentDetails(id).catch(() => null),
        getOnChain(id).catch(() => null),
      ]);
      setOrder(o);
      if (p) setPay(p);
      setChain(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyAddress() {
    const addr = order?.receiveAddress ?? pay?.receiveAddress;
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (loading && !order && !pay) {
    return <p className="muted">Loading order…</p>;
  }

  if (error && !order) {
    return (
      <div className="panel">
        <p className="error">{error}</p>
        <Link to="/merchant/orders" style={{ color: "var(--teal)" }}>
          ← Back to orders
        </Link>
      </div>
    );
  }

  const status = order?.status ?? pay?.status ?? "pending_payment";
  const orderNumber = order?.orderNumber ?? pay?.orderNumber ?? id ?? "—";
  const amount = order?.payableAmount.amount ?? pay?.payableAmount.amount ?? "—";
  const asset = order?.asset ?? pay?.asset ?? "USDT";
  const network = order?.network ?? pay?.network ?? "tron";
  const address = order?.receiveAddress ?? pay?.receiveAddress ?? "";
  const mode = order?.matchingMode ?? pay?.matchingMode ?? "B";
  const expiresAt = order?.expiresAt ?? pay?.expiresAt;
  const qrPayload = pay?.qrPayload ?? "";
  const progress = confirmationProgress(status);
  const isAnomaly = status === "payment_anomaly";
  const received = order?.receivedAmount?.amount ?? chain?.amount?.amount;

  return (
    <div className="detail-page">
      <div className="detail-crumb">
        <Link to="/merchant/orders">Orders Directory</Link>
        <span> / </span>
        <span className="here">Order #{orderNumber}</span>
      </div>

      <div className="detail-columns">
        <div className="detail-left">
          <div className="panel detail-card">
            <div className="detail-header">
              <div>
                <h2>Order Payment Gateway</h2>
                <p className="mono muted">ID: #{orderNumber}</p>
              </div>
              <div className="detail-badges">
                <StatusBadge
                  tone={orderStatusTone(status)}
                  live={status === "verifying"}
                  alarm={status === "payment_anomaly"}
                >
                  {orderStatusLabel(status)}
                </StatusBadge>
                <span className="mode-chip">{matchingModeLabel(mode).toUpperCase()}</span>
              </div>
            </div>

            <div className="detail-amount-row">
              <div>
                <p className="label">PAYABLE</p>
                <p className="detail-amount">
                  {amount} {asset}
                </p>
              </div>
              <div>
                <p className="label">NETWORK</p>
                <p>{networkLabel(network)}</p>
              </div>
              {order?.addressSource ? (
                <div>
                  <p className="label">ADDRESS SOURCE</p>
                  <p className="mono">{order.addressSource}</p>
                </div>
              ) : null}
            </div>

            <div className="qr-section">
              <div className="qr-slot detail-qr">
                {qrPayload ? (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrPayload)}`}
                    alt="Payment QR"
                    width={140}
                    height={140}
                  />
                ) : (
                  "QR"
                )}
              </div>
              <div className="address-details">
                <p className="muted">
                  {asset} ({networkLabel(network)}) Destination Address
                </p>
                <div className="addr-box addr-copy-row">
                  <span>{address || "—"}</span>
                  <button type="button" className="btn-ghost btn-tiny" onClick={copyAddress}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="teal-note">
                  Validity timer: {formatExpiryRemaining(expiresAt)}
                </p>
                {order?.memoOrTag ? (
                  <p className="muted mono">Memo / tag: {order.memoOrTag}</p>
                ) : null}
                {pay?.paymentPageUrl ? (
                  <p>
                    <a
                      href={pay.paymentPageUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--teal)" }}
                    >
                      Open guest payment page
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {isAnomaly ? (
            <div className="anomaly-panel" role="alert">
              <p className="anomaly-title">System Anomaly Flagged</p>
              <p>
                {order.anomalyReason
                  ? `Reason: ${anomalyReasonLabel(order.anomalyReason) ?? order.anomalyReason}. `
                  : ""}
                {received != null
                  ? `Expected ${amount} ${asset}, received ${received} ${asset}. Reconcile manually; there is no Mark paid action.`
                  : "Payment anomaly on this order. Reconcile manually with support; there is no Mark paid action."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="detail-right">
          <div className="panel">
            <h3>Blockchain Confirmations</h3>
            <div
              className={`conf-blocks${progress.filled >= progress.total ? " is-complete" : ""}`}
              aria-hidden
            >
              {Array.from({ length: progress.total }, (_, i) => (
                <div
                  key={i}
                  className={`conf-block${i < progress.filled ? " filled" : ""}`}
                />
              ))}
            </div>
            <p className="muted">
              Status: {progress.filled} of {progress.total} block confirmations
              (approximate until API exposes n/N)
            </p>
            {chain?.txHash ? (
              <p className="mono muted" style={{ marginTop: 12, wordBreak: "break-all" }}>
                tx: {chain.txHash}
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 12 }}>
                No on-chain tx bound yet.
              </p>
            )}
          </div>

          <div className="panel">
            <h3>Order Timeline</h3>
            <ul className="timeline">
              <li className="done">
                <strong>Created</strong>
                <span>{formatShortTime(expiresAt)}</span>
                <p className="muted">{asset} payment request initialized</p>
              </li>
              <li className={chain?.txHash ? "done" : ""}>
                <strong>Detected</strong>
                <span>{chain?.txHash ? "seen" : "—"}</span>
                <p className="muted">Incoming tx on {networkLabel(network)}</p>
              </li>
              <li
                className={
                  status === "verifying" ||
                  status === "confirmed" ||
                  status === "completed"
                    ? "done"
                    : ""
                }
              >
                <strong>Verifying</strong>
                <span>
                  {status === "verifying"
                    ? "pending"
                    : status === "confirmed" || status === "completed"
                      ? "done"
                      : "—"}
                </span>
                <p className="muted">Awaiting required confirmations</p>
              </li>
              <li className={status === "completed" || status === "confirmed" ? "done" : ""}>
                <strong>Confirmed</strong>
                <span>
                  {chain?.confirmedAt ? formatShortTime(chain.confirmedAt) : "—"}
                </span>
                <p className="muted">Settlement validation success</p>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <p style={{ marginTop: 16 }}>
        <Link to="/merchant/orders/new" style={{ color: "var(--teal)" }}>
          Create another order
        </Link>
      </p>
    </div>
  );
}
