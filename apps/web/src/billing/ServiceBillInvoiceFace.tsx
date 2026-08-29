import type { ReactNode, Ref } from "react";

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
  voidedAt?: string | null;
  lastAdjustmentReason?: string | null;
  lastAdjustmentAmount?: string | null;
  paymentReference?: string | null;
  createdAt?: string | null;
};

export type InvoiceBuyer = {
  name: string;
  legalName?: string | null;
  billingEmail?: string | null;
  country?: string | null;
  orgId: string;
};

export type InvoiceSeller = {
  name: string;
  email?: string | null;
};

export type InvoiceRemittance = {
  payTo?: string | null;
  instructions?: string | null;
};

function money(amount: string, currency = "USD"): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `$${amount} ${currency}`;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function displayBillId(id: string): string {
  const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `SB-${compact}`;
}

function tierLabel(tier: string | null | undefined): string {
  if (!tier) return "";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function statusLabel(status: string): string {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Paid";
  if (status === "overdue") return "Overdue";
  if (status === "voided") return "Voided";
  return status;
}

export function platformInvoiceSeller(): InvoiceSeller {
  const name =
    (import.meta.env.VITE_PLATFORM_INVOICE_SELLER_NAME as string | undefined)?.trim() ||
    "CryptoGate";
  const email =
    (import.meta.env.VITE_PLATFORM_INVOICE_SELLER_EMAIL as string | undefined)?.trim() ||
    null;
  return { name, email };
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
  statusBadge: ReactNode;
  toolbar?: ReactNode;
  invoiceRef?: Ref<HTMLElement>;
};

/**
 * Finance invoice face for service bills (Phase 1 field lock).
 * Print targets `.sb-invoice` via CSS.
 */
export function ServiceBillInvoiceFace({
  bill,
  buyer,
  seller = platformInvoiceSeller(),
  remittance,
  statusBadge,
  toolbar,
  invoiceRef,
}: Props) {
  const paid = Boolean(bill.paidAt) && bill.status === "paid";
  const voided = bill.status === "voided";
  const balance = paid || voided ? "0.00" : bill.totalAmount;
  const volumeLine =
    bill.billedVolumeUsd != null && bill.volumeFeePercent != null
      ? `${money(bill.billedVolumeUsd)} × ${bill.volumeFeePercent}%`
      : "Completed payment-order volume in period";

  return (
    <section className="sb-invoice" ref={invoiceRef}>
      <div className="sb-invoice__toolbar no-print">{toolbar}</div>

      <header className="sb-invoice__doc-head">
        <div>
          <p className="sb-invoice__kicker">Service bill invoice</p>
          <h2 className="sb-invoice__doc-id">{displayBillId(bill.id)}</h2>
          <p className="sb-invoice__doc-meta mono">{bill.id}</p>
        </div>
        <div className="sb-invoice__doc-status">
          {statusBadge}
          <dl className="sb-invoice__meta-dl">
            <div>
              <dt>Issued</dt>
              <dd>{shortDate(bill.createdAt ?? bill.periodEnd)}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{shortDate(bill.dueAt)}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>
                {shortDate(bill.periodStart)} → {shortDate(bill.periodEnd)}
              </dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{bill.currency}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="sb-invoice__parties">
        <div className="sb-invoice__party">
          <h3>From (seller)</h3>
          <p className="sb-invoice__party-name">{seller.name}</p>
          {seller.email ? <p className="muted">{seller.email}</p> : null}
          <p className="sb-invoice__party-note">
            Platform SaaS billing — not a merchant payment order
          </p>
        </div>
        <div className="sb-invoice__party">
          <h3>Bill to (buyer)</h3>
          <p className="sb-invoice__party-name">{buyer.name}</p>
          {buyer.legalName ? (
            <p className="muted">Legal · {buyer.legalName}</p>
          ) : null}
          {buyer.billingEmail ? (
            <p className="muted">{buyer.billingEmail}</p>
          ) : null}
          {buyer.country ? <p className="muted">{buyer.country}</p> : null}
          <p className="mono muted">Org · {buyer.orgId}</p>
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
          <tr>
            <td>Subscription</td>
            <td>
              {bill.tier
                ? `${tierLabel(bill.tier)} tier · billing period`
                : "Monthly subscription · billing period"}
            </td>
            <td className="sb-invoice__amt">{money(bill.subscriptionAmount, bill.currency)}</td>
          </tr>
          <tr>
            <td>Volume fee</td>
            <td>
              {volumeLine}
              <span className="sb-invoice__line-note">
                Confirmed completed payment-order volume only
              </span>
            </td>
            <td className="sb-invoice__amt">{money(bill.volumeFeeAmount, bill.currency)}</td>
          </tr>
          {bill.lastAdjustmentReason ? (
            <tr>
              <td>
                Adjustment{" "}
                <span className="sb-invoice__badge">Adjusted</span>
              </td>
              <td>{bill.lastAdjustmentReason}</td>
              <td className="sb-invoice__amt">
                {bill.lastAdjustmentAmount
                  ? money(bill.lastAdjustmentAmount, bill.currency)
                  : "—"}
              </td>
            </tr>
          ) : null}
          <tr className="sb-invoice__total-row">
            <td colSpan={2}>Total due</td>
            <td className="sb-invoice__amt">{money(bill.totalAmount, bill.currency)}</td>
          </tr>
          <tr>
            <td colSpan={2}>Amount paid</td>
            <td className="sb-invoice__amt">
              {paid ? money(bill.totalAmount, bill.currency) : money("0.00", bill.currency)}
            </td>
          </tr>
          <tr>
            <td colSpan={2}>Balance</td>
            <td className="sb-invoice__amt">{money(balance, bill.currency)}</td>
          </tr>
        </tbody>
      </table>

      <div className="sb-invoice__remit">
        <h3>Remittance</h3>
        <p>
          Pay via <strong>service-bill checkout</strong> to the platform billing
          wallet. Do not use the guest payment page or merchant receive addresses.
        </p>
        {remittance?.payTo ? (
          <p className="sb-invoice__payto">
            <span className="label">Pay to</span>
            <span className="mono">{remittance.payTo}</span>
          </p>
        ) : (
          <p className="muted">
            Pay-to instructions appear on service-bill checkout when the bill is
            payable.
          </p>
        )}
        {remittance?.instructions ? (
          <p className="muted sb-invoice__instructions">{remittance.instructions}</p>
        ) : null}
      </div>

      {paid ? (
        <div className="sb-invoice__receipt">
          <h3>Receipt</h3>
          <dl className="sb-invoice__meta-dl">
            <div>
              <dt>Paid at</dt>
              <dd>{shortDate(bill.paidAt)}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd className="mono">{bill.paymentReference || "—"}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{money(bill.totalAmount, bill.currency)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{statusLabel(bill.status)}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
