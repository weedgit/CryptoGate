import type { ReactNode, Ref } from "react";
import { explorerTxUrl } from "../shared/chainExplorer";
import { formatDocumentDateTime } from "../shared/dateTime";
import {
  IconFactCalendar,
  IconFactCurrency,
  IconFactDue,
  IconFactSite,
  IconFactUser,
  InvoiceAddress,
  InvoiceBrandHead,
  InvoiceChainInline,
  InvoiceClosed,
  InvoiceExplorerLink,
  InvoiceLines,
  InvoicePaper,
  InvoicePartyFacts,
  InvoicePayCard,
  InvoiceReceipt,
  InvoiceTotals,
  InvoiceTxHash,
  invoiceCryptoPlain,
  invoiceMoney,
  invoiceMoneyPlain,
  type InvoiceDlRow,
  type InvoiceFact,
} from "./invoiceParts";

/** Minimal payment-order shape for the finance document face. */
export type PoInvoiceOrder = {
  id: string;
  orderNumber: string;
  status: string;
  matchingMode: string;
  payableAmount: string;
  receivedAmount?: string | null;
  invoiceAmountUsd?: string | null;
  /** "fiat" (USD / EUR invoice converted to crypto) or "crypto" (exact token amount). */
  invoiceDenomination?: string | null;
  invoiceCurrency?: string | null;
  invoiceAmount?: string | null;
  pricingRate?: string | null;
  pricingMode?: string | null;
  rateSource?: string | null;
  referenceRate?: string | null;
  referenceSource?: string | null;
  rateWarning?: string | null;
  quoteExpiresAt?: string | null;
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
  /** Merchant/site business zone; timestamps fall back to the viewer's zone. */
  businessTimezone?: string | null;
};

export type PoInvoiceSeller = {
  name: string;
  legalName?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
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
  qrPayload?: string | null;
};

function cryptoAmount(amount: string | number, asset: string): string {
  return `${invoiceCryptoPlain(amount)} ${asset}`;
}

function docDate(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return "—";
  return formatDocumentDateTime(iso, timeZone);
}

function isSettled(status: string): boolean {
  return status === "completed" || status === "confirmed";
}

function isClosed(status: string): boolean {
  return status === "expired" || status === "failed" || status === "cancelled";
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

function documentSubtitle(status: string): string {
  if (isSettled(status)) return "Payment Receipt";
  if (status === "payment_anomaly") return "Payment Invoice · Attention";
  if (isClosed(status)) return "Payment Invoice · Closed";
  return "Payment Invoice";
}

function closedStamp(status: string): string {
  if (status === "expired") return "EXPIRED";
  if (status === "failed") return "FAILED";
  return "CANCELLED";
}

function showAnomalyBlock(order: PoInvoiceOrder): boolean {
  if (order.status === "payment_anomaly") return true;
  return Boolean(
    order.status === "cancelled" &&
      (order.anomalyReason || order.anomalyResolutionNote),
  );
}

function fiatCell(order: PoInvoiceOrder): { value: string; note: string | null } {
  if (order.invoiceDenomination === "crypto") {
    return {
      value: "—",
      note: order.invoiceAmountUsd
        ? `≈ ${invoiceMoney(order.invoiceAmountUsd, "USD")}`
        : "Exact token amount",
    };
  }
  if (order.invoiceCurrency === "EUR" && order.invoiceAmount) {
    return {
      value: `€${invoiceMoneyPlain(order.invoiceAmount)} EUR`,
      note: order.invoiceAmountUsd
        ? `≈ ${invoiceMoney(order.invoiceAmountUsd, "USD")}`
        : null,
    };
  }
  return {
    value: order.invoiceAmountUsd ? invoiceMoney(order.invoiceAmountUsd, "USD") : "—",
    note: null,
  };
}

function rateNote(order: PoInvoiceOrder): string | null {
  const parts = [
    order.rateSource,
    order.pricingMode,
    order.referenceRate
      ? `ref $${order.referenceRate}${order.referenceSource ? ` (${order.referenceSource})` : ""}`
      : null,
    order.rateWarning,
    order.quoteExpiresAt && order.status === "pending_payment"
      ? `quote until ${docDate(order.quoteExpiresAt, order.businessTimezone)}`
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type Props = {
  order: PoInvoiceOrder;
  seller: PoInvoiceSeller;
  onChain?: PoInvoiceOnChain | null;
  remittance?: PoInvoiceRemittance | null;
  statusBadge?: ReactNode;
  toolbar?: ReactNode;
  invoiceRef?: Ref<HTMLElement>;
};

/**
 * Finance invoice/receipt face for payment orders, built on the shared paper
 * invoice parts. System of record remains the payment order — not a service bill.
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
  const tz = order.businessTimezone;
  const settled = isSettled(order.status);
  const closed = isClosed(order.status);
  const anomaly = showAnomalyBlock(order);
  const received =
    order.receivedAmount ?? onChain?.amount ?? (settled ? order.payableAmount : null);
  const modeLabel = order.matchingModeLabel ?? order.matchingMode;
  const txHash = onChain?.txHash ?? null;
  const explorerUrl = txHash ? explorerTxUrl(order.network, txHash) : null;
  const createdBy = humanStaffLabel(order.createdByLabel);
  const fiat = fiatCell(order);
  const payable = order.payableAmount;
  const hasPayable = Number.isFinite(Number(payable));

  const facts: InvoiceFact[] = [
    {
      icon: <IconFactCalendar />,
      label: "Issue date",
      value: docDate(order.createdAt, tz),
    },
    settled && order.paidAt
      ? { icon: <IconFactDue />, label: "Paid", value: docDate(order.paidAt, tz) }
      : { icon: <IconFactDue />, label: "Expires", value: docDate(order.expiresAt, tz) },
    {
      icon: <IconFactCurrency />,
      label: "Currency",
      value:
        order.invoiceDenomination === "crypto"
          ? order.asset
          : order.invoiceCurrency || "USD",
    },
  ];
  if (order.siteName) {
    facts.push({ icon: <IconFactSite />, label: "Site", value: order.siteName });
  }
  if (createdBy) {
    facts.push({ icon: <IconFactUser />, label: "Created by", value: createdBy });
  }

  const receiptRows: InvoiceDlRow[] = [
    {
      label: "Confirmed at",
      value: docDate(onChain?.confirmedAt ?? (settled ? order.paidAt : null), tz),
    },
    {
      label: "Amount received",
      value: received != null ? cryptoAmount(received, order.asset) : "—",
    },
    { label: "Tx hash", value: <InvoiceTxHash txHash={txHash} network={order.network} /> },
    ...(explorerUrl
      ? [{ label: "Explorer", value: <InvoiceExplorerLink href={explorerUrl} /> }]
      : []),
    {
      label: "From address",
      value: <InvoiceAddress address={onChain?.fromAddress} network={order.network} />,
    },
    {
      label: "Receive address",
      value: <InvoiceAddress address={order.receiveAddress} network={order.network} />,
    },
  ];
  if (order.addressSource) {
    receiptRows.push({
      label: "Address source",
      value: `${order.addressSource}${order.hdIndex != null ? ` · HD index ${order.hdIndex}` : ""}`,
      span: true,
    });
  }

  return (
    <InvoicePaper invoiceRef={invoiceRef} toolbar={toolbar} className="po-invoice">
      <InvoiceBrandHead
        seller={{ name: seller.name, email: seller.contactEmail, phone: seller.phone }}
        subtitle={documentSubtitle(order.status)}
        docLabel={settled ? "Receipt" : "Invoice"}
        docId={`#${order.orderNumber}`}
        statusBadge={statusBadge}
      />

      <InvoicePartyFacts
        title="Bill to"
        party={{ name: "Guest payer" }}
        lines={[
          onChain?.fromAddress ? (
            <InvoiceAddress address={onChain.fromAddress} network={order.network} />
          ) : (
            "Pays on-chain"
          ),
          <InvoiceChainInline asset={order.asset} network={order.network} />,
        ]}
        facts={facts}
      />

      <InvoiceLines columns={["Description", "Fiat", "Rate", "Amount"]}>
        <tr>
          <td>
            {order.merchantReference?.trim() || "Payment"}
            <span className="sb-invoice__line-note">
              {order.asset} on {order.networkLabel} · Mode {order.matchingMode} ·{" "}
              {modeLabel}
            </span>
            {order.memoOrTag ? (
              <span className="sb-invoice__line-note">
                Memo / tag · <span className="mono">{order.memoOrTag}</span>
              </span>
            ) : null}
          </td>
          <td>
            {fiat.value}
            {fiat.note ? <span className="sb-invoice__line-note">{fiat.note}</span> : null}
          </td>
          <td>
            {order.pricingRate ? `$${order.pricingRate}` : "—"}
            {rateNote(order) ? (
              <span className="sb-invoice__line-note">{rateNote(order)}</span>
            ) : null}
          </td>
          <td className="sb-invoice__amt">{cryptoAmount(payable, order.asset)}</td>
        </tr>
      </InvoiceLines>

      <InvoiceTotals
        dueLabel="Amount due"
        due={cryptoAmount(payable, order.asset)}
        paid={cryptoAmount(settled ? (received ?? payable) : 0, order.asset)}
        balance={cryptoAmount(settled || closed || !hasPayable ? 0 : payable, order.asset)}
      />

      {anomaly ? (
        <div className="sb-invoice__remit po-invoice__anomaly" role="alert">
          <h3>
            {order.status === "payment_anomaly" ? "Attention" : "Resolved — Attention"}
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
              <dd>{cryptoAmount(payable, order.asset)}</dd>
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
                ? ` (${docDate(order.anomalyResolvedAt, tz)})`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {closed && !anomaly ? (
        <InvoiceClosed
          stamp={closedStamp(order.status)}
          reason={
            order.status === "expired"
              ? `Expired ${docDate(order.expiresAt, tz)} with no matching payment.`
              : null
          }
          emptyReason="No remittance due — order is closed."
          rows={[
            {
              label: "Asset / network",
              value: <InvoiceChainInline asset={order.asset} network={order.network} />,
            },
            {
              label: "Receive address",
              value: <InvoiceAddress address={order.receiveAddress} network={order.network} />,
            },
            { label: "Amount", value: cryptoAmount(payable, order.asset) },
          ]}
        />
      ) : null}

      {txHash || settled ? (
        <InvoiceReceipt
          title={settled ? "Payment receipt" : "On-chain evidence"}
          note={
            settled
              ? null
              : "Transaction detected — waiting for the required confirmations."
          }
          rows={receiptRows}
        />
      ) : null}

      {order.status === "pending_payment" && !txHash ? (
        <InvoicePayCard
          title="Payment instructions"
          note={
            <>
              Send the <strong>exact</strong> amount on {order.networkLabel} only. Wrong
              network is not auto-credited.
              {order.memoOrTag ? ` Include memo / tag ${order.memoOrTag}.` : ""}
            </>
          }
          qrPayload={remittance?.qrPayload?.trim() || order.receiveAddress || null}
          qrAlt={`Payment QR for order ${order.orderNumber}`}
          qrMissing="QR unavailable"
          asset={order.asset}
          network={order.network}
          amount={payable}
          addressLabel="Receive address"
          address={order.receiveAddress || null}
        />
      ) : null}
    </InvoicePaper>
  );
}
