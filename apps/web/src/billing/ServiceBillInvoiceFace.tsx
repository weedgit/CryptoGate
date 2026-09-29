import { type ReactNode, type Ref } from "react";
import { explorerTxUrl } from "../shared/chainExplorer";
import { displayServiceBillTxHash } from "../shared/serviceBillPeriod";
import {
  IconFactCalendar,
  IconFactCurrency,
  IconFactDue,
  IconFactPeriod,
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
  InvoiceZonedDate,
  invoiceMoney,
  invoiceMoneyPlain,
  invoicePeriodLabel,
  invoiceShortDate,
  normalizePlatformSellerName,
  type InvoiceParty,
  type InvoiceSeller,
} from "./invoiceParts";
import {
  SERVICE_BILL_ASSET,
  SERVICE_BILL_NETWORK,
  serviceBillQrPayload,
} from "./serviceBillRemittance";

export { BrandName, normalizePlatformSellerName } from "./invoiceParts";
export type { InvoiceSeller } from "./invoiceParts";

/** Minimal bill shape shared by platform / merchant / agent clients. */
export type InvoiceBill = {
  id: string;
  orgId: string;
  periodStart: string;
  periodEnd: string;
  subscriptionAmount: string;
  volumeFeeAmount: string;
  totalAmount: string;
  currency: string;
  status: string;
  dueAt: string;
  tier?: string | null;
  volumeFeePercent?: string | null;
  billedVolumeUsd?: string | null;
  paidAt?: string | null;
  cancelledAt?: string | null;
  waivedAt?: string | null;
  closeReason?: string | null;
  lastAdjustmentReason?: string | null;
  lastAdjustmentAmount?: string | null;
  paymentReference?: string | null;
  rxAddress?: string | null;
  txAddress?: string | null;
  createdAt?: string | null;
  opsNote?: string | null;
};

export type InvoiceBuyer = InvoiceParty;

export type InvoiceRemittance = {
  payTo?: string | null;
  instructions?: string | null;
};

export function displayBillId(id: string): string {
  const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `SB-${compact}`;
}

function tierLabel(tier: string | null | undefined): string {
  if (!tier) return "";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function isPayable(status: string): boolean {
  return status === "issued" || status === "overdue";
}

function isClosed(status: string): boolean {
  return status === "waived" || status === "cancelled";
}

function closedStamp(status: string): string {
  return status === "waived" ? "WAIVED" : "CANCELLED";
}

export function platformInvoiceSeller(): InvoiceSeller {
  const name = normalizePlatformSellerName(
    (import.meta.env.VITE_PLATFORM_INVOICE_SELLER_NAME as string | undefined)?.trim() ||
      "PaymentGate",
  );
  const email =
    (import.meta.env.VITE_PLATFORM_INVOICE_SELLER_EMAIL as string | undefined)?.trim() ||
    null;
  const phone =
    (import.meta.env.VITE_PLATFORM_INVOICE_SELLER_PHONE as string | undefined)?.trim() ||
    null;
  return { name, email, phone };
}

/** Prefer API invoice seller, then billing wallet, then env fallbacks. */
export function resolveServiceBillInvoiceSeller(opts: {
  bill?: { invoiceSeller?: InvoiceSeller | null } | null;
  billing?: {
    sellerName?: string;
    sellerEmail?: string | null;
    sellerPhone?: string | null;
  } | null;
}): InvoiceSeller {
  const env = platformInvoiceSeller();
  const fromBill = opts.bill?.invoiceSeller;
  if (fromBill) {
    return {
      name: normalizePlatformSellerName(fromBill.name?.trim() || env.name),
      email: fromBill.email?.trim() || env.email,
      phone: fromBill.phone?.trim() || opts.billing?.sellerPhone?.trim() || env.phone,
    };
  }
  return {
    name: normalizePlatformSellerName(
      opts.billing?.sellerName?.trim() || env.name,
    ),
    email: opts.billing?.sellerEmail?.trim() || env.email,
    phone: opts.billing?.sellerPhone?.trim() || env.phone,
  };
}

export function platformBillingPayToFallback(): string | null {
  return (
    (import.meta.env.VITE_PLATFORM_BILLING_PAY_TO as string | undefined)?.trim() || null
  );
}

type Props = {
  bill: InvoiceBill;
  buyer: InvoiceBuyer;
  seller?: InvoiceSeller;
  remittance?: InvoiceRemittance | null;
  /** Prefer checkout API payload when available. */
  qrPayload?: string | null;
  statusBadge?: ReactNode;
  toolbar?: ReactNode;
  invoiceRef?: Ref<HTMLElement>;
};

/**
 * Finance invoice face for service bills — the reference invoice layout.
 * Print targets `.sb-invoice` via CSS.
 */
export function ServiceBillInvoiceFace({
  bill,
  buyer,
  seller = platformInvoiceSeller(),
  remittance,
  qrPayload: qrPayloadProp,
  statusBadge,
  toolbar,
  invoiceRef,
}: Props) {
  const paid = Boolean(bill.paidAt) && bill.status === "paid";
  const closed = isClosed(bill.status);
  const payable = isPayable(bill.status);
  const balance = paid || closed ? "0.00" : bill.totalAmount;
  const payTo = remittance?.payTo?.trim() || bill.rxAddress?.trim() || null;
  const qrPayload =
    qrPayloadProp ?? (payTo ? serviceBillQrPayload(payTo, bill.totalAmount) : null);
  const txHash = displayServiceBillTxHash(bill.paymentReference);
  const explorerUrl = txHash
    ? explorerTxUrl(SERVICE_BILL_NETWORK, txHash)
    : null;
  const closedReason =
    bill.closeReason?.trim() ||
    bill.lastAdjustmentReason?.trim() ||
    bill.opsNote?.trim() ||
    null;
  const amountWithAsset = `${invoiceMoneyPlain(bill.totalAmount)} ${SERVICE_BILL_ASSET}`;

  return (
    <InvoicePaper invoiceRef={invoiceRef} toolbar={toolbar}>
      <InvoiceBrandHead
        seller={seller}
        subtitle="Platform Service Invoice"
        docId={displayBillId(bill.id)}
        statusBadge={statusBadge}
      />

      <InvoicePartyFacts
        title="Bill to"
        party={buyer}
        facts={[
          {
            icon: <IconFactCalendar />,
            label: "Issue date",
            value: bill.createdAt ? (
              <InvoiceZonedDate iso={bill.createdAt} />
            ) : (
              invoiceShortDate(bill.periodEnd)
            ),
          },
          {
            icon: <IconFactDue />,
            label: "Due date",
            value: invoiceShortDate(bill.dueAt),
          },
          {
            icon: <IconFactPeriod />,
            label: "Billing period",
            value: invoicePeriodLabel(bill.periodStart, bill.periodEnd),
            className: "sb-invoice__fact-period",
          },
          {
            icon: <IconFactCurrency />,
            label: "Currency",
            value: bill.currency,
          },
        ]}
      />

      <InvoiceLines columns={["Description", "Volume", "Rate", "Amount"]}>
        <tr>
          <td>
            Subscription
            {bill.tier ? ` — ${tierLabel(bill.tier)}` : ""}
          </td>
          <td>—</td>
          <td>—</td>
          <td className="sb-invoice__amt">
            {invoiceMoney(bill.subscriptionAmount, bill.currency)}
          </td>
        </tr>
        <tr>
          <td>Volume fee</td>
          <td>
            {bill.billedVolumeUsd != null
              ? invoiceMoney(bill.billedVolumeUsd, bill.currency)
              : "—"}
          </td>
          <td>
            {bill.volumeFeePercent != null ? `${bill.volumeFeePercent}%` : "—"}
          </td>
          <td className="sb-invoice__amt">
            {invoiceMoney(bill.volumeFeeAmount, bill.currency)}
          </td>
        </tr>
        {bill.lastAdjustmentReason ? (
          <tr>
            <td>Adjustment — {bill.lastAdjustmentReason}</td>
            <td>—</td>
            <td>—</td>
            <td className="sb-invoice__amt">
              {bill.lastAdjustmentAmount
                ? invoiceMoney(bill.lastAdjustmentAmount, bill.currency)
                : "—"}
            </td>
          </tr>
        ) : null}
      </InvoiceLines>

      <InvoiceTotals
        due={invoiceMoney(bill.totalAmount, bill.currency)}
        paid={invoiceMoney(paid ? bill.totalAmount : "0.00", bill.currency)}
        balance={invoiceMoney(balance, bill.currency)}
      />

      {closed ? (
        <InvoiceClosed
          stamp={closedStamp(bill.status)}
          reason={closedReason}
          emptyReason="No remittance due — bill is closed."
          rows={[
            {
              label: "Asset / network",
              value: (
                <InvoiceChainInline
                  asset={SERVICE_BILL_ASSET}
                  network={SERVICE_BILL_NETWORK}
                />
              ),
            },
            {
              label: "Receive address",
              value: <InvoiceAddress address={payTo} network={SERVICE_BILL_NETWORK} />,
            },
            { label: "Amount", value: amountWithAsset },
          ]}
        />
      ) : null}

      {paid ? (
        <InvoiceReceipt
          title="Payment receipt"
          rows={[
            { label: "Paid at", value: <InvoiceZonedDate iso={bill.paidAt} /> },
            { label: "Amount", value: amountWithAsset },
            {
              label: "Tx hash",
              value: <InvoiceTxHash txHash={txHash} network={SERVICE_BILL_NETWORK} />,
            },
            ...(explorerUrl
              ? [{ label: "Explorer", value: <InvoiceExplorerLink href={explorerUrl} /> }]
              : []),
            {
              label: "Rx address",
              value: (
                <InvoiceAddress
                  address={bill.rxAddress || payTo}
                  network={SERVICE_BILL_NETWORK}
                />
              ),
            },
            {
              label: "Tx address",
              value: (
                <InvoiceAddress address={bill.txAddress} network={SERVICE_BILL_NETWORK} />
              ),
            },
          ]}
        />
      ) : null}

      {payable ? (
        <InvoicePayCard
          title="Platform remittance"
          note={`Invoice is in ${bill.currency}. Settle the balance due by sending the same amount in ${SERVICE_BILL_ASSET} (1:1).`}
          qrPayload={qrPayload}
          qrAlt="Service bill payment QR"
          qrMissing={payTo ? "QR unavailable" : "Pay-to not configured"}
          asset={SERVICE_BILL_ASSET}
          network={SERVICE_BILL_NETWORK}
          amount={bill.totalAmount}
          addressLabel="Receive address"
          address={payTo}
        />
      ) : null}

      {!payable && !paid && !closed ? (
        <div className="sb-invoice__remit">
          <h3>Remittance</h3>
          <p className="muted">
            Pay-to instructions appear when this bill is issued.
          </p>
        </div>
      ) : null}
    </InvoicePaper>
  );
}
