import { useState } from "react";
import { PaymentQrCanvas } from "../shared/PaymentQrCanvas";
import { displayNetworkForPair } from "../shared/assetNetworks";
import {
  AssetIcon,
  NetworkIcon,
  QrCenterNetworkMark,
} from "../platform/cryptoIcons";

/** Phase 1 service-bill remittance is USDT on Tron (platform billing wallet). */
export const SERVICE_BILL_ASSET = "USDT";
export const SERVICE_BILL_NETWORK = "tron";

/**
 * Wallet URI for service-bill remittance (matches API `serviceBillQrPayload`).
 */
export function serviceBillQrPayload(
  payTo: string,
  totalAmount: string,
): string | null {
  if (!payTo.startsWith("T") || payTo.length < 30) return null;
  const q = new URLSearchParams({
    amount: totalAmount,
    asset: SERVICE_BILL_ASSET,
    network: SERVICE_BILL_NETWORK,
  });
  return `tron:${payTo}?${q.toString()}`;
}

type Props = {
  totalAmount: string;
  payTo: string | null;
  /** Prefer API checkout qrPayload when available. */
  qrPayload?: string | null;
  status: string;
  dueAt: string;
  /** Optional status line under the QR (defaults from status / due). */
  timerLabel?: string;
  /** Show loading placeholder instead of QR. */
  loading?: boolean;
  hint?: string;
};

function defaultTimerLabel(status: string, dueAt: string): string {
  if (status === "paid") return "Payment completed — QR no longer needed";
  if (status === "voided") return "Bill voided";
  if (status === "overdue") return "Overdue — settle remittance promptly";
  if (status === "issued") {
    try {
      return `Due ${new Date(dueAt).toLocaleString()}`;
    } catch {
      return "Payable";
    }
  }
  return status;
}

/**
 * Merchant-order-style pay card: amount + QR + copyable billing address.
 * Used on service bill detail (merchant / platform / agent).
 */
export function ServiceBillPayQrCard({
  totalAmount,
  payTo,
  qrPayload: qrPayloadProp,
  status,
  dueAt,
  timerLabel,
  loading = false,
  hint = "Platform remittance — not a guest payment order address.",
}: Props) {
  const [copied, setCopied] = useState(false);
  const payable = status === "issued" || status === "overdue";
  const paid = status === "paid";
  const voided = status === "voided";
  const qrPayload =
    qrPayloadProp ??
    (payTo ? serviceBillQrPayload(payTo, totalAmount) : null);
  const networkDisplay = displayNetworkForPair(
    SERVICE_BILL_ASSET,
    SERVICE_BILL_NETWORK,
  );
  const timer =
    timerLabel ?? defaultTimerLabel(status, dueAt);

  async function copyPayTo() {
    if (!payTo) return;
    try {
      await navigator.clipboard.writeText(payTo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="plat-settings__card order-detail-gateway">
      <div className="plat-settings__card-body order-detail-gateway__body">
        <div className="order-detail-gateway__pay-panel">
          <div className="order-detail-gateway__amount">
            <div className="order-detail-gateway__chain-icons" aria-hidden>
              <AssetIcon asset={SERVICE_BILL_ASSET} />
              <NetworkIcon network={SERVICE_BILL_NETWORK} />
            </div>
            <span className="order-detail-gateway__amount-label">
              Amount due
            </span>
            <p className="order-detail-gateway__amount-value fund-amount">
              {totalAmount} {SERVICE_BILL_ASSET}
            </p>
            <p className="order-detail-gateway__amount-net">
              <NetworkIcon network={SERVICE_BILL_NETWORK} />
              <span>{networkDisplay}</span>
            </p>
          </div>

          <div className="order-detail-gateway__qr-wrap">
            <div className="order-detail-gateway__qr">
              {loading ? (
                <span className="muted">Loading QR…</span>
              ) : qrPayload && payable ? (
                <>
                  <PaymentQrCanvas
                    payload={qrPayload}
                    size={204}
                    alt="Service bill payment QR"
                  />
                  <span
                    className="order-detail-gateway__qr-mark"
                    aria-hidden
                  >
                    <QrCenterNetworkMark network={SERVICE_BILL_NETWORK} />
                  </span>
                </>
              ) : (
                <span className="muted">
                  {paid
                    ? "Paid — QR closed"
                    : voided
                      ? "Voided"
                      : payTo
                        ? "QR unavailable"
                        : "Set billing wallet pay-to"}
                </span>
              )}
            </div>
            <p
              className={`order-detail-gateway__timer${
                paid || voided || !payable ? " is-terminal" : ""
              }`}
            >
              {timer}
            </p>
          </div>

          <div className="order-detail-gateway__address-block">
            <span className="order-detail-gateway__field-label">
              Payment address
            </span>
            <div className="order-detail-gateway__address-row">
              <div
                className="order-detail-gateway__address-icons"
                aria-hidden
              >
                <AssetIcon asset={SERVICE_BILL_ASSET} />
                <NetworkIcon network={SERVICE_BILL_NETWORK} />
              </div>
              <p
                className="order-detail-gateway__address mono"
                title={payTo || undefined}
              >
                {payTo || "—"}
              </p>
            </div>
            <button
              type="button"
              className="order-detail-gateway__copy-btn"
              onClick={() => void copyPayTo()}
              disabled={!payTo}
            >
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>

          {hint ? (
            <p className="order-detail-gateway__hint muted">{hint}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
