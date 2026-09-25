import { type ReactNode, type Ref } from "react";
import { PaymentQrCanvas } from "../shared/PaymentQrCanvas";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { explorerTxUrl } from "../shared/chainExplorer";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { displayServiceBillTxHash } from "../shared/serviceBillPeriod";
import { truncateAddress } from "../platform/orgDetailSeeds";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import {
  AssetIcon,
  NetworkIcon,
  QrCenterNetworkMark,
} from "../platform/cryptoIcons";
import {
  SERVICE_BILL_ASSET,
  SERVICE_BILL_NETWORK,
  serviceBillQrPayload,
} from "./serviceBillRemittance";

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
  rxAddress?: string | null;
  txAddress?: string | null;
  createdAt?: string | null;
  opsNote?: string | null;
};

export type InvoiceBuyer = {
  name: string;
  legalName?: string | null;
  /** Org billing / invoice email (not personal login). */
  contactEmail?: string | null;
  phone?: string | null;
  country?: string | null;
};

export type InvoiceSeller = {
  name: string;
  email?: string | null;
  phone?: string | null;
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

function moneyPlain(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  return status === "voided" || status === "cancelled";
}

function closedStamp(status: string): string {
  if (status === "cancelled") return "CANCELLED";
  return "VOIDED";
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

/** Collapse "PaymentGate Platform" → "PaymentGate" for invoice branding. */
export function normalizePlatformSellerName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "PaymentGate";
  if (/^payment\s*gate(\s+platform)?$/i.test(trimmed)) return "PaymentGate";
  return trimmed;
}

/** Split PaymentGate so "Gate" can take the gold brand accent. */
export function BrandName({ name }: { name: string }) {
  const match = name.match(/^(.*?)(gate)(.*)$/i);
  if (!match) {
    return <p className="sb-invoice__brand-name">{name}</p>;
  }
  const [, before, gate, after] = match;
  return (
    <p className="sb-invoice__brand-name">
      {before}
      <span className="sb-invoice__brand-gate">{gate}</span>
      {after}
    </p>
  );
}

export function platformBillingPayToFallback(): string | null {
  return (
    (import.meta.env.VITE_PLATFORM_BILLING_PAY_TO as string | undefined)?.trim() || null
  );
}

function IconFactCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm13 8H4v10h16zm0-2V6H4v2z"
      />
    </svg>
  );
}

function IconFactDue() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 2.5L17.5 8H14zM8 12h8v1.5H8zm0 3.5h8V17H8zm0-7h4V10H8z"
      />
    </svg>
  );
}

function IconFactPeriod() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm13 8H4v10h16zm-9.5 2.5h2v5h-2zm0-3.5h2v2h-2z"
      />
    </svg>
  );
}

function IconFactCurrency() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 14.9V18h-2v-1.1a3.5 3.5 0 0 1-2.6-3.3h1.7c.1 1 .9 1.7 1.9 1.7s1.8-.6 1.8-1.5c0-1.1-.9-1.4-2.2-1.8-1.6-.5-3.1-1.1-3.1-3.1 0-1.5 1.1-2.6 2.5-2.9V5h2v1.1a3.2 3.2 0 0 1 2.3 3h-1.7c-.1-.8-.7-1.4-1.6-1.4s-1.5.5-1.5 1.3c0 .9.8 1.2 2.1 1.6 1.7.5 3.2 1.2 3.2 3.3 0 1.6-1.1 2.8-2.8 3.1"
      />
    </svg>
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
 * Finance invoice face for service bills.
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
  const networkDisplay = displayNetworkForPair(
    SERVICE_BILL_ASSET,
    SERVICE_BILL_NETWORK,
  );
  const txHash = displayServiceBillTxHash(bill.paymentReference);
  const explorerUrl = txHash
    ? explorerTxUrl(SERVICE_BILL_NETWORK, txHash)
    : null;
  const closedReason =
    bill.lastAdjustmentReason?.trim() ||
    bill.opsNote?.trim() ||
    null;

  return (
    <section className="sb-invoice sb-invoice--paper" ref={invoiceRef}>
      {toolbar ? (
        <div className="sb-invoice__toolbar no-print">{toolbar}</div>
      ) : null}

      <header className="sb-invoice__brand-head">
        <div className="sb-invoice__brand">
          <div className="sb-invoice__brand-title">
            <OrgBrandMark
              name={seller.name}
              size={36}
              className="sb-invoice__brand-mark"
            />
            <BrandName name={seller.name} />
          </div>
          <div className="sb-invoice__brand-meta">
            <p className="sb-invoice__brand-sub">Platform Service Invoice</p>
            <p className="sb-invoice__brand-email">
              {seller.email?.trim() || "—"}
            </p>
            <p className="sb-invoice__brand-phone">
              {seller.phone?.trim() || "—"}
            </p>
          </div>
        </div>
        <div className="sb-invoice__doc-title">
          <p className="sb-invoice__doc-label">Invoice</p>
          <h2 className="sb-invoice__doc-id">{displayBillId(bill.id)}</h2>
          {statusBadge ? (
            <div className="sb-invoice__doc-badge no-print">{statusBadge}</div>
          ) : null}
        </div>
      </header>

      <div className="sb-invoice__billto-row">
        <div className="sb-invoice__billto">
          <h3>Bill to</h3>
          <p className="sb-invoice__party-name">{buyer.name}</p>
          {buyer.legalName ? (
            <p className="sb-invoice__party-line">{buyer.legalName}</p>
          ) : null}
          <p className="sb-invoice__party-line">
            {buyer.contactEmail?.trim() || "—"}
          </p>
          <p className="sb-invoice__party-line">
            {buyer.phone?.trim() || "—"}
          </p>
          {buyer.country ? (
            <p className="sb-invoice__party-line">{buyer.country}</p>
          ) : null}
        </div>
        <dl className="sb-invoice__facts">
          <div>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                <IconFactCalendar />
              </span>
              Issue date
            </dt>
            <dd>{shortDate(bill.createdAt ?? bill.periodEnd)}</dd>
          </div>
          <div>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                <IconFactDue />
              </span>
              Due date
            </dt>
            <dd>{shortDate(bill.dueAt)}</dd>
          </div>
          <div>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                <IconFactPeriod />
              </span>
              Billing period
            </dt>
            <dd className="sb-invoice__fact-period">
              {shortDate(bill.periodStart)} – {shortDate(bill.periodEnd)}
            </dd>
          </div>
          <div>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                <IconFactCurrency />
              </span>
              Currency
            </dt>
            <dd>{bill.currency}</dd>
          </div>
        </dl>
      </div>

      <table className="sb-invoice__lines sb-invoice__lines--mock">
        <thead>
          <tr>
            <th>Description</th>
            <th>Volume</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              Subscription
              {bill.tier ? ` — ${tierLabel(bill.tier)}` : ""}
            </td>
            <td>—</td>
            <td>—</td>
            <td className="sb-invoice__amt">
              {money(bill.subscriptionAmount, bill.currency)}
            </td>
          </tr>
          <tr>
            <td>Volume fee</td>
            <td>
              {bill.billedVolumeUsd != null
                ? money(bill.billedVolumeUsd, bill.currency)
                : "—"}
            </td>
            <td>
              {bill.volumeFeePercent != null
                ? `${bill.volumeFeePercent}%`
                : "—"}
            </td>
            <td className="sb-invoice__amt">
              {money(bill.volumeFeeAmount, bill.currency)}
            </td>
          </tr>
          {bill.lastAdjustmentReason ? (
            <tr>
              <td>Adjustment — {bill.lastAdjustmentReason}</td>
              <td>—</td>
              <td>—</td>
              <td className="sb-invoice__amt">
                {bill.lastAdjustmentAmount
                  ? money(bill.lastAdjustmentAmount, bill.currency)
                  : "—"}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="sb-invoice__totals">
        <div className="sb-invoice__totals-row">
          <span>Total due</span>
          <span>{money(bill.totalAmount, bill.currency)}</span>
        </div>
        <div className="sb-invoice__totals-row">
          <span>Amount paid</span>
          <span>
            {paid
              ? money(bill.totalAmount, bill.currency)
              : money("0.00", bill.currency)}
          </span>
        </div>
        <div className="sb-invoice__totals-row sb-invoice__totals-row--balance">
          <span>Balance due</span>
          <span>{money(balance, bill.currency)}</span>
        </div>
      </div>

      {closed ? (
        <div className="sb-invoice__remit sb-invoice__remit--closed">
          <div className="sb-invoice__stamp" aria-hidden>
            {closedStamp(bill.status)}
          </div>
          <h3>Closed remittance</h3>
          {closedReason ? (
            <p className="sb-invoice__closed-reason">
              <span className="label">Reason</span>
              {closedReason}
            </p>
          ) : (
            <p className="muted">No remittance due — bill is closed.</p>
          )}
          <dl className="sb-invoice__remit-dl">
            <div>
              <dt>Asset / network</dt>
              <dd>
                <span className="sb-invoice__chain-inline">
                  <AssetIcon asset={SERVICE_BILL_ASSET} />
                  <NetworkIcon network={SERVICE_BILL_NETWORK} />
                  <span>
                    {SERVICE_BILL_ASSET} · {networkDisplay}
                  </span>
                </span>
              </dd>
            </div>
            <div>
              <dt>Receive address</dt>
              <dd>
                {payTo ? (
                  <CopyableChainValue
                    value={payTo}
                    network={SERVICE_BILL_NETWORK}
                    kind="address"
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>
                {moneyPlain(bill.totalAmount)} {SERVICE_BILL_ASSET}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {paid ? (
        <div className="sb-invoice__remit sb-invoice__remit--receipt">
          <h3>Payment receipt</h3>
          <dl className="sb-invoice__remit-dl">
            <div>
              <dt>Paid at</dt>
              <dd>{shortDate(bill.paidAt)}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>
                {moneyPlain(bill.totalAmount)} {SERVICE_BILL_ASSET}
              </dd>
            </div>
            <div>
              <dt>Tx hash</dt>
              <dd>
                {txHash ? (
                  <CopyableChainValue
                    value={txHash}
                    network={SERVICE_BILL_NETWORK}
                    kind="tx"
                    display={truncateAddress(txHash, 8, 6)}
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {explorerUrl ? (
              <div>
                <dt>Explorer</dt>
                <dd>
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="sb-invoice__guest-link"
                  >
                    Open transaction
                  </a>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Rx address</dt>
              <dd>
                {bill.rxAddress || payTo ? (
                  <CopyableChainValue
                    value={bill.rxAddress || payTo}
                    network={SERVICE_BILL_NETWORK}
                    kind="address"
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>Tx address</dt>
              <dd>
                {bill.txAddress ? (
                  <CopyableChainValue
                    value={bill.txAddress}
                    network={SERVICE_BILL_NETWORK}
                    kind="address"
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {payable ? (
        <div className="sb-invoice__remit sb-invoice__remit--pay">
          <h3>Platform remittance</h3>
          <p className="sb-invoice__remit-note">
            Invoice is in {bill.currency}. Settle the balance due by sending the
            same amount in {SERVICE_BILL_ASSET} (1:1).
          </p>
          <div className="sb-invoice__remit-grid">
            <div className="sb-invoice__qr-wrap">
              {qrPayload ? (
                <>
                  <PaymentQrCanvas
                    payload={qrPayload}
                    size={152}
                    alt="Service bill payment QR"
                  />
                  <span className="sb-invoice__qr-mark" aria-hidden>
                    <QrCenterNetworkMark network={SERVICE_BILL_NETWORK} />
                  </span>
                </>
              ) : (
                <div className="sb-invoice__qr-missing">
                  {payTo ? "QR unavailable" : "Pay-to not configured"}
                </div>
              )}
            </div>
            <div className="sb-invoice__remit-body">
              <div className="sb-invoice__remit-top">
                <div className="sb-invoice__remit-field">
                  <span className="sb-invoice__remit-field-label">
                    Network &amp; asset
                  </span>
                  <p className="sb-invoice__remit-lead">
                    <span className="sb-invoice__chain-inline">
                      <AssetIcon asset={SERVICE_BILL_ASSET} />
                      <NetworkIcon network={SERVICE_BILL_NETWORK} />
                    </span>
                    <span className="sb-invoice__remit-pair">
                      <span className="sb-invoice__remit-asset">
                        {SERVICE_BILL_ASSET}
                      </span>
                      <span className="sb-invoice__remit-pair-sep" aria-hidden>
                        -
                      </span>
                      <span className="sb-invoice__remit-net">
                        {networkDisplay}
                      </span>
                    </span>
                  </p>
                </div>
                <div className="sb-invoice__remit-field sb-invoice__remit-field--amt">
                  <span className="sb-invoice__remit-field-label">Amount</span>
                  <p className="sb-invoice__remit-amt">
                    <span className="sb-invoice__remit-amt-num">
                      {moneyPlain(bill.totalAmount)}
                    </span>
                    <span className="sb-invoice__remit-amt-unit">
                      {SERVICE_BILL_ASSET}
                    </span>
                  </p>
                </div>
              </div>
              <dl className="sb-invoice__remit-dl">
                <div>
                  <dt>Receive address</dt>
                  <dd>
                    {payTo ? (
                      <CopyableChainValue
                        value={payTo}
                        network={SERVICE_BILL_NETWORK}
                        kind="address"
                      />
                    ) : (
                      <span className="muted">Not configured</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}

      {!payable && !paid && !closed ? (
        <div className="sb-invoice__remit">
          <h3>Remittance</h3>
          <p className="muted">
            Pay-to instructions appear when this bill is issued.
          </p>
        </div>
      ) : null}
    </section>
  );
}
