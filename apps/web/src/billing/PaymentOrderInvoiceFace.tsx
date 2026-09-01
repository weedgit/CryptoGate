import type { ReactNode, Ref } from "react";
import { CopyableChainValue } from "../shared/CopyableChainValue";

/** Minimal payment-order shape for the finance document face. */
export type PoInvoiceOrder = {
  id: string;
  orderNumber: string;
  status: string;
  matchingMode: string;
  payableAmount: string;
  receivedAmount?: string | null;
  asset: string;
  network: string;
  networkLabel: string;
  receiveAddress: string;
  addressSource?: string | null;
  hdIndex?: number | null;
  memoOrTag?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
  paidAt?: string | null;
  siteName?: string | null;
  createdByLabel?: string | null;
  merchantReference?: string | null;
  anomalyReason?: string | null;
  anomalyReasonLabel?: string | null;
  anomalyGuidance?: string | null;
  anomalyAmountLine?: string | null;
  anomalyResolutionNote?: string | null;
  anomalyResolvedAt?: string | null;
  matchingModeLabel?: string | null;
};

export type PoInvoiceSeller = {
  name: string;
  legalName?: string | null;
  contactEmail?: string | null;
  orgId: string;
};

export type PoInvoiceOnChain = {
  txHash?: string | null;
  fromAddress?: string | null;
  amount?: string | null;
  confirmedAt?: string | null;
};

export type PoInvoiceRemittance = {
  paymentPageUrl?: string | null;
};

function cryptoAmount(amount: string, asset: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${asset}`;
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })} ${asset}`;
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSettled(status: string): boolean {
  return status === "completed" || status === "confirmed";
}

/** Staff label suitable for merchant-facing invoice copy (email/name — not internal user ids). */
function humanStaffLabel(label: string | null | undefined): string | null {
  const value = label?.trim();
  if (!value) return null;
  if (value.includes("@")) return value;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  if (/^[0-9a-f]{6,8}…$/i.test(value)) return null;
  return value;
}

function documentKicker(status: string): string {
  if (isSettled(status)) return "Payment receipt";
  if (status === "payment_anomaly") return "Payment anomaly document";
  if (status === "expired" || status === "failed" || status === "cancelled") {
    return "Payment invoice (closed)";
  }
  return "Payment invoice";
}

function showAnomalyBlock(order: PoInvoiceOrder): boolean {
  if (order.status === "payment_anomaly") return true;
  return Boolean(
    order.status === "cancelled" &&
      (order.anomalyReason || order.anomalyResolutionNote),
  );
}

type Props = {
  order: PoInvoiceOrder;
  seller: PoInvoiceSeller;
  onChain?: PoInvoiceOnChain | null;
  remittance?: PoInvoiceRemittance | null;
  statusBadge: ReactNode;
  toolbar?: ReactNode;
  invoiceRef?: Ref<HTMLElement>;
};

/**
 * Finance invoice/receipt face for payment orders (Phase 1 field lock).
 * Reuses `.sb-invoice` print styles; root also has `.po-invoice`.
 * System of record remains the payment order — not a service bill.
 */
export function PaymentOrderInvoiceFace({
  order,
  seller,
  onChain,
  remittance,
  statusBadge,
  toolbar,
  invoiceRef,
}: Props) {
  const settled = isSettled(order.status);
  const received =
    order.receivedAmount ?? onChain?.amount ?? (settled ? order.payableAmount : null);
  const modeLabel = order.matchingModeLabel ?? order.matchingMode;
  const hasTx = Boolean(onChain?.txHash);
  const createdBy = humanStaffLabel(order.createdByLabel);

  return (
    <section className="sb-invoice po-invoice" ref={invoiceRef}>
      <div className="sb-invoice__toolbar no-print">{toolbar}</div>

      <header className="sb-invoice__doc-head">
        <div>
          <p className="sb-invoice__kicker">{documentKicker(order.status)}</p>
          <h2 className="sb-invoice__doc-id">#{order.orderNumber}</h2>
        </div>
        <div className="sb-invoice__doc-status">
          {statusBadge}
          <dl className="sb-invoice__meta-dl">
            <div>
              <dt>Created</dt>
              <dd>{shortDate(order.createdAt)}</dd>
            </div>
            {settled && order.paidAt ? (
              <div>
                <dt>Paid</dt>
                <dd>{shortDate(order.paidAt)}</dd>
              </div>
            ) : (
              <div>
                <dt>Expires</dt>
                <dd>{shortDate(order.expiresAt)}</dd>
              </div>
            )}
            {order.siteName ? (
              <div>
                <dt>Site</dt>
                <dd>{order.siteName}</dd>
              </div>
            ) : null}
            {createdBy ? (
              <div>
                <dt>Created by</dt>
                <dd>{createdBy}</dd>
              </div>
            ) : null}
            <div>
              <dt>Asset</dt>
              <dd>
                {order.asset} · {order.networkLabel}
              </dd>
            </div>
            <div>
              <dt>Matching</dt>
              <dd>
                Mode {order.matchingMode} · {modeLabel}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="sb-invoice__parties">
        <div className="sb-invoice__party">
          <h3>From (merchant)</h3>
          <p className="sb-invoice__party-name">{seller.name}</p>
          {seller.legalName ? (
            <p className="muted">Legal · {seller.legalName}</p>
          ) : null}
          {seller.contactEmail ? (
            <p className="muted">{seller.contactEmail}</p>
          ) : null}
        </div>
        <div className="sb-invoice__party">
          <h3>Bill to (payer)</h3>
          <p className="sb-invoice__party-name">Guest payer</p>
          {onChain?.fromAddress ? (
            <p className="sb-invoice__party-chain">
              <span className="muted">From · </span>
              <CopyableChainValue
                value={onChain.fromAddress}
                network={order.network}
                kind="address"
              />
            </p>
          ) : null}
        </div>
      </div>

      <table className="sb-invoice__lines">
        <thead>
          <tr>
            <th>Description</th>
            <th>Detail</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="sb-invoice__total-row">
            <td>Crypto collection</td>
            <td>
              {order.asset} on {order.networkLabel}
            </td>
            <td className="sb-invoice__amt">
              {cryptoAmount(order.payableAmount, order.asset)}
            </td>
          </tr>
          {order.merchantReference ? (
            <tr>
              <td>Reference</td>
              <td colSpan={2}>{order.merchantReference}</td>
            </tr>
          ) : null}
          {order.memoOrTag ? (
            <tr>
              <td>Memo / tag</td>
              <td colSpan={2} className="mono">
                {order.memoOrTag}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="sb-invoice__remit">
        <h3>Remittance (merchant wallet)</h3>
        <p>
          Send <strong>exact</strong> payable amount on{" "}
          <strong>{order.networkLabel}</strong> only. Wrong network is not
          auto-credited.
        </p>
        <p className="sb-invoice__payto">
          <span className="label">Receive address</span>
          <CopyableChainValue
            value={order.receiveAddress}
            network={order.network}
            kind="address"
          />
        </p>
        {order.addressSource ? (
          <p className="muted">
            Address source · {order.addressSource}
            {order.hdIndex != null ? ` · HD index ${order.hdIndex}` : ""}
          </p>
        ) : null}
        {remittance?.paymentPageUrl ? (
          <p className="sb-invoice__payto no-print">
            <span className="label">Guest page</span>
            <a
              href={remittance.paymentPageUrl}
              target="_blank"
              rel="noreferrer"
              className="sb-invoice__guest-link"
            >
              Open guest payment page
            </a>
          </p>
        ) : null}
      </div>

      {showAnomalyBlock(order) ? (
        <div className="sb-invoice__receipt po-invoice__anomaly" role="alert">
          <h3>
            {order.status === "payment_anomaly"
              ? "Payment anomaly"
              : "Resolved payment anomaly"}
          </h3>
          <p>
            {order.anomalyReasonLabel
              ? `${order.anomalyReasonLabel}. `
              : order.anomalyReason
                ? `${order.anomalyReason}. `
                : ""}
            {order.status === "payment_anomaly"
              ? order.anomalyGuidance ||
                "Reconcile manually — there is no Mark paid action."
              : null}
          </p>
          <dl className="sb-invoice__meta-dl">
            <div>
              <dt>Expected</dt>
              <dd>{cryptoAmount(order.payableAmount, order.asset)}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>
                {received != null
                  ? cryptoAmount(received, order.asset)
                  : "— (see tx on explorer)"}
              </dd>
            </div>
          </dl>
          {order.anomalyResolutionNote ? (
            <p>
              <strong>Staff note:</strong> {order.anomalyResolutionNote}
              {order.anomalyResolvedAt
                ? ` (${shortDate(order.anomalyResolvedAt)})`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasTx || settled ? (
        <div className="sb-invoice__receipt">
          <h3>{settled ? "On-chain receipt" : "On-chain evidence"}</h3>
          <dl className="sb-invoice__meta-dl sb-invoice__meta-dl--receipt">
            <div className="sb-invoice__meta-span-2">
              <dt>Tx hash</dt>
              <dd>
                <CopyableChainValue
                  value={onChain?.txHash}
                  network={order.network}
                  kind="tx"
                />
              </dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>
                <CopyableChainValue
                  value={onChain?.fromAddress}
                  network={order.network}
                  kind="address"
                />
              </dd>
            </div>
            <div>
              <dt>Confirmed</dt>
              <dd>
                {shortDate(onChain?.confirmedAt ?? (settled ? order.paidAt : null))}
              </dd>
            </div>
            <div className="sb-invoice__meta-span-2">
              <dt>Received</dt>
              <dd>
                {received != null
                  ? cryptoAmount(received, order.asset)
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
