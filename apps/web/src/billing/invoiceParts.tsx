import { type ReactNode, type Ref } from "react";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { PaymentQrCanvas } from "../shared/PaymentQrCanvas";
import { zoneAbbrev } from "../shared/dateTime";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { formatPhoneDisplay } from "../shared/phoneFormat";
import { useViewerTimeZone } from "../shared/useViewerTimeZone";
import { truncateAddress } from "../platform/orgDetailSeeds";
import {
  AssetIcon,
  NetworkIcon,
  QrCenterNetworkMark,
} from "../platform/cryptoIcons";

/**
 * Building blocks of the paper invoice (`.sb-invoice`). The platform fee
 * invoice is the reference layout; every invoice face composes these parts.
 */

export type InvoiceParty = {
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

export type InvoiceFact = {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  className?: string;
};

export type InvoiceDlRow = {
  label: string;
  value: ReactNode;
  /** Spans both columns (notes). */
  span?: boolean;
};

export function invoiceMoney(amount: string | number, currency = "USD"): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `$${amount} ${currency}`;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function invoiceMoneyPlain(amount: string | number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Crypto amounts keep up to 8 decimals so fingerprinted amounts stay exact. */
export function invoiceCryptoPlain(amount: string | number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

/** `YYYY-MM-DD` values are calendar dates and ignore the zone. */
export function invoiceShortDate(
  iso: string | null | undefined,
  timeZone?: string,
): string {
  if (!iso) return "—";
  const dateOnly = iso.length === 10;
  const d = new Date(dateOnly ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(timeZone && !dateOnly ? { timeZone } : {}),
  });
}

/** Date in the viewer's profile zone, e.g. "Sep 28, 2026 (PDT)". */
export function InvoiceZonedDate({ iso }: { iso: string | null | undefined }) {
  const tz = useViewerTimeZone();
  if (!iso) return <>—</>;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return <>{iso}</>;
  return <>{`${invoiceShortDate(iso, tz)} (${zoneAbbrev(tz, at)})`}</>;
}

export function invoicePeriodLabel(start: string, end: string): string {
  const a = invoiceShortDate(start);
  const b = invoiceShortDate(end);
  return a === b ? a : `${a} – ${b}`;
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

export function IconFactCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm13 8H4v10h16zm0-2V6H4v2z"
      />
    </svg>
  );
}

export function IconFactDue() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 2.5L17.5 8H14zM8 12h8v1.5H8zm0 3.5h8V17H8zm0-7h4V10H8z"
      />
    </svg>
  );
}

export function IconFactPeriod() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm13 8H4v10h16zm-9.5 2.5h2v5h-2zm0-3.5h2v2h-2z"
      />
    </svg>
  );
}

export function IconFactCurrency() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 14.9V18h-2v-1.1a3.5 3.5 0 0 1-2.6-3.3h1.7c.1 1 .9 1.7 1.9 1.7s1.8-.6 1.8-1.5c0-1.1-.9-1.4-2.2-1.8-1.6-.5-3.1-1.1-3.1-3.1 0-1.5 1.1-2.6 2.5-2.9V5h2v1.1a3.2 3.2 0 0 1 2.3 3h-1.7c-.1-.8-.7-1.4-1.6-1.4s-1.5.5-1.5 1.3c0 .9.8 1.2 2.1 1.6 1.7.5 3.2 1.2 3.2 3.3 0 1.6-1.1 2.8-2.8 3.1"
      />
    </svg>
  );
}

export function IconFactRate() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M18.4 4.2 19.8 5.6 5.6 19.8 4.2 18.4zM7 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7m0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m10 8a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7m0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3"
      />
    </svg>
  );
}

export function IconFactSite() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M4 3h16l1.5 5.5a3 3 0 0 1-2.5 3.46V21H5v-9.04A3 3 0 0 1 2.5 8.5zm1.53 2-1.1 4a1 1 0 0 0 1.96.4L6.5 9h2l.1.4a1.45 1.45 0 0 0 2.8 0l.1-.4h1l.1.4a1.45 1.45 0 0 0 2.8 0l.1-.4h2l.11.4a1 1 0 0 0 1.96-.4l-1.1-4zM7 12v7h3v-4h4v4h3v-7a3 3 0 0 1-1.5-.8 3.4 3.4 0 0 1-3.5.6 3.4 3.4 0 0 1-3.5-.6A3 3 0 0 1 7 12"
      />
    </svg>
  );
}

export function IconFactUser() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6m0 10c4.4 0 8 2.2 8 5v3H4v-3c0-2.8 3.6-5 8-5m0 2c-3.4 0-6 1.6-6 3v1h12v-1c0-1.4-2.6-3-6-3"
      />
    </svg>
  );
}

export function InvoicePaper({
  invoiceRef,
  toolbar,
  className,
  children,
}: {
  invoiceRef?: Ref<HTMLElement>;
  toolbar?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`sb-invoice sb-invoice--paper${className ? ` ${className}` : ""}`}
      ref={invoiceRef}
    >
      {toolbar ? (
        <div className="sb-invoice__toolbar no-print">{toolbar}</div>
      ) : null}
      {children}
    </section>
  );
}

export function InvoiceBrandHead({
  seller,
  subtitle,
  docId,
  docLabel = "Invoice",
  statusBadge,
}: {
  seller: InvoiceSeller;
  subtitle: string;
  docId: string;
  docLabel?: string;
  statusBadge?: ReactNode;
}) {
  return (
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
          <p className="sb-invoice__brand-sub">{subtitle}</p>
          <p className="sb-invoice__brand-email">
            {seller.email?.trim() || "—"}
          </p>
          <p className="sb-invoice__brand-phone">
            {formatPhoneDisplay(seller.phone) || "—"}
          </p>
        </div>
      </div>
      <div className="sb-invoice__doc-title">
        <p className="sb-invoice__doc-label">{docLabel}</p>
        <h2 className="sb-invoice__doc-id">{docId}</h2>
        {statusBadge ? (
          <div className="sb-invoice__doc-badge no-print">{statusBadge}</div>
        ) : null}
      </div>
    </header>
  );
}

/** Counterparty block ("Bill to" / "Payee") beside the key facts. */
export function InvoicePartyFacts({
  title,
  party,
  lines,
  facts,
}: {
  title: string;
  party: InvoiceParty;
  /** Replaces the email / phone / country lines (e.g. an on-chain payer). */
  lines?: ReactNode[];
  facts: InvoiceFact[];
}) {
  return (
    <div className="sb-invoice__billto-row">
      <div className="sb-invoice__billto">
        <h3>{title}</h3>
        <p className="sb-invoice__party-name">{party.name}</p>
        {party.legalName?.trim() && party.legalName.trim() !== party.name.trim() ? (
          <p className="sb-invoice__party-line">{party.legalName}</p>
        ) : null}
        {lines ? (
          lines.map((line, i) => (
            <p key={i} className="sb-invoice__party-line">
              {line}
            </p>
          ))
        ) : (
          <>
            <p className="sb-invoice__party-line">
              {party.contactEmail?.trim() || "—"}
            </p>
            <p className="sb-invoice__party-line">
              {formatPhoneDisplay(party.phone) || "—"}
            </p>
            {party.country ? (
              <p className="sb-invoice__party-line">{party.country}</p>
            ) : null}
          </>
        )}
      </div>
      <dl className="sb-invoice__facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                {fact.icon}
              </span>
              {fact.label}
            </dt>
            <dd className={fact.className}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Line table — first column is the description, the rest align right. */
export function InvoiceLines({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <table className="sb-invoice__lines sb-invoice__lines--mock">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function InvoiceTotals({
  dueLabel = "Total due",
  due,
  paid,
  balance,
}: {
  dueLabel?: string;
  due: string;
  paid: string;
  balance: string;
}) {
  return (
    <div className="sb-invoice__totals">
      <div className="sb-invoice__totals-row">
        <span>{dueLabel}</span>
        <span>{due}</span>
      </div>
      <div className="sb-invoice__totals-row">
        <span>Amount paid</span>
        <span>{paid}</span>
      </div>
      <div className="sb-invoice__totals-row sb-invoice__totals-row--balance">
        <span>Balance due</span>
        <span>{balance}</span>
      </div>
    </div>
  );
}

export function InvoiceChainInline({
  asset,
  network,
}: {
  asset: string;
  network: string;
}) {
  return (
    <span className="sb-invoice__chain-inline">
      <AssetIcon asset={asset} />
      <NetworkIcon network={network} />
      <span>
        {asset} · {displayNetworkForPair(asset, network)}
      </span>
    </span>
  );
}

export function InvoiceAddress({
  address,
  network,
}: {
  address: string | null | undefined;
  network: string;
}) {
  return address ? (
    <CopyableChainValue value={address} network={network} kind="address" />
  ) : (
    <>—</>
  );
}

export function InvoiceTxHash({
  txHash,
  network,
}: {
  txHash: string | null | undefined;
  network: string;
}) {
  return txHash ? (
    <CopyableChainValue
      value={txHash}
      network={network}
      kind="tx"
      display={truncateAddress(txHash, 8, 6)}
    />
  ) : (
    <>—</>
  );
}

export function InvoiceExplorerLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="sb-invoice__guest-link"
    >
      Open transaction
    </a>
  );
}

function InvoiceDl({ rows }: { rows: InvoiceDlRow[] }) {
  return (
    <dl className="sb-invoice__remit-dl">
      {rows.map((row) => (
        <div
          key={row.label}
          className={row.span ? "sb-invoice__remit-span" : undefined}
        >
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Paid / settled proof block. */
export function InvoiceReceipt({
  title,
  note,
  rows,
}: {
  title: string;
  note?: ReactNode;
  rows: InvoiceDlRow[];
}) {
  return (
    <div className="sb-invoice__remit sb-invoice__remit--receipt">
      <h3>{title}</h3>
      {note ? <p className="sb-invoice__remit-note">{note}</p> : null}
      <InvoiceDl rows={rows} />
    </div>
  );
}

/** Waived / cancelled stamp with the reason and the remittance it replaced. */
export function InvoiceClosed({
  stamp,
  reason,
  emptyReason,
  rows,
}: {
  stamp: string;
  reason: string | null;
  emptyReason: string;
  rows: InvoiceDlRow[];
}) {
  return (
    <div className="sb-invoice__remit sb-invoice__remit--closed">
      <div className="sb-invoice__stamp" aria-hidden>
        {stamp}
      </div>
      <h3>Closed remittance</h3>
      {reason ? (
        <p className="sb-invoice__closed-reason">
          <span className="label">Reason</span>
          {reason}
        </p>
      ) : (
        <p className="muted">{emptyReason}</p>
      )}
      <InvoiceDl rows={rows} />
    </div>
  );
}

/** Open balance: QR + asset/network + amount + receive address. */
export function InvoicePayCard({
  title,
  note,
  qrPayload,
  qrAlt,
  qrMissing,
  asset,
  network,
  amount,
  addressLabel,
  address,
  missing,
}: {
  title: string;
  note: ReactNode;
  qrPayload: string | null;
  qrAlt: string;
  qrMissing: string;
  asset: string;
  network: string;
  amount: string | number;
  addressLabel: string;
  address: string | null;
  /** Replaces the QR grid when there is nowhere to send funds. */
  missing?: ReactNode;
}) {
  return (
    <div className="sb-invoice__remit sb-invoice__remit--pay">
      <h3>{title}</h3>
      <p className="sb-invoice__remit-note">{note}</p>
      {missing && !address ? (
        <p className="sb-invoice__remit-missing">{missing}</p>
      ) : (
        <div className="sb-invoice__remit-grid">
          <div className="sb-invoice__qr-wrap">
            {qrPayload ? (
              <>
                <PaymentQrCanvas payload={qrPayload} size={152} alt={qrAlt} />
                <span className="sb-invoice__qr-mark" aria-hidden>
                  <QrCenterNetworkMark network={network} />
                </span>
              </>
            ) : (
              <div className="sb-invoice__qr-missing">{qrMissing}</div>
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
                    <AssetIcon asset={asset} />
                    <NetworkIcon network={network} />
                  </span>
                  <span className="sb-invoice__remit-pair">
                    <span className="sb-invoice__remit-asset">{asset}</span>
                    <span className="sb-invoice__remit-pair-sep" aria-hidden>
                      -
                    </span>
                    <span className="sb-invoice__remit-net">
                      {displayNetworkForPair(asset, network)}
                    </span>
                  </span>
                </p>
              </div>
              <div className="sb-invoice__remit-field sb-invoice__remit-field--amt">
                <span className="sb-invoice__remit-field-label">Amount</span>
                <p className="sb-invoice__remit-amt">
                  <span className="sb-invoice__remit-amt-num">
                    {invoiceCryptoPlain(amount)}
                  </span>
                  <span className="sb-invoice__remit-amt-unit">{asset}</span>
                </p>
              </div>
            </div>
            <dl className="sb-invoice__remit-dl">
              <div>
                <dt>{addressLabel}</dt>
                <dd>
                  {address ? (
                    <CopyableChainValue
                      value={address}
                      network={network}
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
      )}
    </div>
  );
}
