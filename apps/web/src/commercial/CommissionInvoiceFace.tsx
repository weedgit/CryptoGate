import { type ReactNode, type Ref } from "react";
import { Link } from "react-router-dom";
import {
  BrandName,
  normalizePlatformSellerName,
  platformInvoiceSeller,
} from "../billing/ServiceBillInvoiceFace";
import {
  AssetIcon,
  NetworkIcon,
  QrCenterNetworkMark,
} from "../platform/cryptoIcons";
import { FundAmount } from "../platform/FundAmount";
import { serviceBillStatusLabel } from "../platform/serviceBillStatus";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { explorerTxUrl } from "../shared/chainExplorer";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { PaymentQrCanvas } from "../shared/PaymentQrCanvas";
import { formatViewerDateTime } from "../shared/dateTime";
import { displayServiceBillTxHash } from "../shared/serviceBillPeriod";
import { truncateAddress } from "../platform/orgDetailSeeds";
import { formatCommissionPeriodLabel } from "./commissionStatements";
import {
  commissionInvoiceDetailPath,
  commissionPayoutRemittanceUri,
  type CommissionPayoutRecord,
} from "./commissionPayoutRecords";
import {
  displayCommissionInvoiceId,
  invoiceStatusLabel,
  invoiceStatusTone,
  remittanceNetwork,
  type CommissionInvoiceDest,
} from "./commissionInvoiceShared";

type OrgParentLookup = { parentId?: string | null };

function formatOnboardDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function moneyPlain(amount: number): string {
  if (!Number.isFinite(amount)) return String(amount);
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function IconFactRate() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 14.9V18h-2v-1.1a3.5 3.5 0 0 1-2.6-3.3h1.7c.1 1 .9 1.7 1.9 1.7s1.8-.6 1.8-1.5c0-1.1-.9-1.4-2.2-1.8-1.6-.5-3.1-1.1-3.1-3.1 0-1.5 1.1-2.6 2.5-2.9V5h2v1.1a3.2 3.2 0 0 1 2.3 3h-1.7c-.1-.8-.7-1.4-1.6-1.4s-1.5.5-1.5 1.3c0 .9.8 1.2 2.1 1.6 1.7.5 3.2 1.2 3.2 3.3 0 1.6-1.1 2.8-2.8 3.1"
      />
    </svg>
  );
}

function IconFactFees() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z"
      />
    </svg>
  );
}

function IconFactCommission() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 2.5L17.5 8H14zM8 12h8v1.5H8zm0 3.5h8V17H8zm0-7h4V10H8z"
      />
    </svg>
  );
}

type Props = {
  slip: CommissionPayoutRecord;
  dest: CommissionInvoiceDest | null;
  /** Which portal is viewing — drives invoice deep-link copy. */
  viewerPortal?: "platform" | "agent";
  byId?: Map<string, OrgParentLookup>;
  orgHref?: (
    type: string,
    orgId: string,
    parentId: string | null,
  ) => string | null;
  statusBadge?: ReactNode;
  missingAddressHint?: string;
  invoiceRef?: Ref<HTMLElement>;
};

/**
 * Paper invoice face for platform → agent commission payouts.
 * Print targets `.sb-invoice` via CSS.
 */
export function CommissionInvoiceFace({
  slip,
  dest,
  viewerPortal = "platform",
  byId,
  orgHref,
  statusBadge,
  missingAddressHint = "No payout address on this agent yet.",
  invoiceRef,
}: Props) {
  const seller = platformInvoiceSeller();
  const brandName = normalizePlatformSellerName(seller.name);
  const remittanceUri =
    dest?.address
      ? commissionPayoutRemittanceUri({
          address: dest.address,
          amount: slip.commissionAmount,
          asset: dest.asset,
          network: dest.network,
        })
      : "";
  const qrPayload = remittanceUri || dest?.address || "";
  const asset = dest?.asset ?? slip.asset ?? "USDT";
  const network = dest?.network ?? slip.network ?? "tron";
  const networkDisplay = displayNetworkForPair(asset, network);
  const paid =
    slip.payoutStatus === "paid" || slip.payoutStatus === "settled";
  const settled = slip.payoutStatus === "settled";
  const payable = slip.payoutStatus === "issued";
  const balance = paid ? 0 : slip.commissionAmount;
  const txHash = displayServiceBillTxHash(slip.txRef);
  const explorerUrl = txHash ? explorerTxUrl(network, txHash) : null;
  const merchants = slip.treeSnapshot?.merchants ?? [];
  const invoicePath = commissionInvoiceDetailPath(viewerPortal, slip.id);
  const zeroFeeIssued =
    payable &&
    merchants.length > 0 &&
    merchants.every((m) => !m.includedInCommission);

  return (
    <section className="sb-invoice sb-invoice--paper" ref={invoiceRef}>
      <header className="sb-invoice__brand-head">
        <div className="sb-invoice__brand">
          <div className="sb-invoice__brand-title">
            <OrgBrandMark
              name={brandName}
              size={36}
              className="sb-invoice__brand-mark"
            />
            <BrandName name={brandName} />
          </div>
          <div className="sb-invoice__brand-meta">
            <p className="sb-invoice__brand-sub">Platform Commission Invoice</p>
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
          <h2 className="sb-invoice__doc-id">
            {displayCommissionInvoiceId(slip.id)}
          </h2>
          {statusBadge ? (
            <div className="sb-invoice__doc-badge no-print">{statusBadge}</div>
          ) : (
            <div className="sb-invoice__doc-badge no-print">
              <span
                className={`plat-commissions__status is-${invoiceStatusTone(slip.payoutStatus)}`}
              >
                {invoiceStatusLabel(slip.payoutStatus)}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="sb-invoice__billto-row">
        <div className="sb-invoice__billto">
          <h3>Bill to</h3>
          <p className="sb-invoice__party-name">{slip.payeeName}</p>
          <p className="sb-invoice__party-line">Agent payee</p>
          <p className="sb-invoice__party-line">Platform → agent remittance</p>
        </div>
        <dl className="sb-invoice__facts">
          <div>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                <IconFactPeriod />
              </span>
              Period
            </dt>
            <dd>{formatCommissionPeriodLabel(slip.periodKey)}</dd>
          </div>
          <div>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                <IconFactRate />
              </span>
              Rate
            </dt>
            <dd>{slip.commissionPercent}%</dd>
          </div>
          <div>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                <IconFactFees />
              </span>
              Platform fees
            </dt>
            <dd>
              <FundAmount amount={slip.platformFeeCollected} />
            </dd>
          </div>
          <div>
            <dt>
              <span className="sb-invoice__fact-icon" aria-hidden>
                <IconFactCommission />
              </span>
              Commission
            </dt>
            <dd>
              <FundAmount amount={slip.commissionAmount} />
            </dd>
          </div>
        </dl>
      </div>

      {merchants.length > 0 ? (
        <table className="sb-invoice__lines sb-invoice__lines--mock">
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Onboarded</th>
              <th>Bill status</th>
              <th>Volume fee</th>
              <th>Included</th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((line) => {
              const parentId = byId?.get(line.orgId)?.parentId ?? null;
              const href = orgHref?.(line.type, line.orgId, parentId) ?? null;
              return (
                <tr key={line.orgId}>
                  <td>
                    {href ? (
                      <Link className="sb-invoice__guest-link" to={href}>
                        {line.name}
                      </Link>
                    ) : (
                      line.name
                    )}
                  </td>
                  <td>{formatOnboardDate(line.onboardedAt)}</td>
                  <td>
                    {line.billStatus ? (
                      <span
                        className={`org-agents__bill is-${line.billStatus}`}
                      >
                        {serviceBillStatusLabel(line.billStatus)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="sb-invoice__amt">
                    <FundAmount amount={line.volumeFeeAmount} />
                  </td>
                  <td>{line.includedInCommission ? "Y" : "N"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted" style={{ margin: "0 0 1rem" }}>
          No merchant fee-base lines for this period (no paid monthly merchant
          bills under this agent).
        </p>
      )}

      {zeroFeeIssued ? (
        <p className="banner banner-warn" style={{ marginBottom: "1rem" }}>
          Issued at $0 — merchants in the tree had no paid platform fees in this
          period. Commission due is zero until fees are collected.
        </p>
      ) : null}

      <div className="sb-invoice__totals">
        <div className="sb-invoice__totals-row">
          <span>Commission due</span>
          <span>
            <FundAmount amount={slip.commissionAmount} />
          </span>
        </div>
        <div className="sb-invoice__totals-row">
          <span>Amount paid</span>
          <span>
            {paid ? (
              <FundAmount amount={slip.commissionAmount} />
            ) : (
              <FundAmount amount={0} />
            )}
          </span>
        </div>
        <div className="sb-invoice__totals-row sb-invoice__totals-row--balance">
          <span>Balance due</span>
          <span>
            <FundAmount amount={balance} />
          </span>
        </div>
      </div>

      {settled ? (
        <div className="sb-invoice__remit sb-invoice__remit--receipt">
          <h3>Settlement receipt</h3>
          <dl className="sb-invoice__remit-dl">
            <div>
              <dt>Settled at</dt>
              <dd>
                {slip.settledAt
                  ? formatViewerDateTime(slip.settledAt)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>
                {moneyPlain(slip.commissionAmount)} {asset}
              </dd>
            </div>
            <div>
              <dt>Tx hash</dt>
              <dd>
                {txHash ? (
                  <CopyableChainValue
                    value={txHash}
                    network={remittanceNetwork(slip)}
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
              <dt>Payout address</dt>
              <dd>
                {dest?.address ? (
                  <CopyableChainValue
                    value={dest.address}
                    network={remittanceNetwork({ network })}
                    kind="address"
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {slip.note?.trim() ? (
              <div className="sb-invoice__remit-span">
                <dt>Note</dt>
                <dd>{slip.note.trim()}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {slip.payoutStatus === "paid" ? (
        <div className="sb-invoice__remit sb-invoice__remit--receipt">
          <h3>Payment sent</h3>
          <p className="sb-invoice__remit-note">
            {viewerPortal === "agent"
              ? "Confirm receipt in the side panel to settle"
              : "Awaiting agent confirmation"}
            {slip.paidAt
              ? ` · ${formatViewerDateTime(slip.paidAt)}`
              : ""}
          </p>
          <dl className="sb-invoice__remit-dl">
            <div>
              <dt>Amount</dt>
              <dd>
                {moneyPlain(slip.commissionAmount)} {asset}
              </dd>
            </div>
            <div>
              <dt>Invoice link</dt>
              <dd>
                <Link className="sb-invoice__guest-link" to={invoicePath}>
                  {displayCommissionInvoiceId(slip.id)}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Tx hash</dt>
              <dd>
                {txHash ? (
                  <CopyableChainValue
                    value={txHash}
                    network={remittanceNetwork(slip)}
                    kind="tx"
                    display={truncateAddress(txHash, 8, 6)}
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>Payout address</dt>
              <dd>
                {dest?.address ? (
                  <CopyableChainValue
                    value={dest.address}
                    network={remittanceNetwork({ network })}
                    kind="address"
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {slip.note?.trim() ? (
              <div className="sb-invoice__remit-span">
                <dt>Note</dt>
                <dd>{slip.note.trim()}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {payable ? (
        <div className="sb-invoice__remit sb-invoice__remit--pay">
          <h3>Commission remittance</h3>
          <p className="sb-invoice__remit-note">
            Settle this invoice by sending the commission amount in {asset} to
            the agent payout address.
          </p>
          {dest?.address ? (
            <div className="sb-invoice__remit-grid">
              <div className="sb-invoice__qr-wrap">
                {qrPayload ? (
                  <>
                    <PaymentQrCanvas
                      payload={qrPayload}
                      size={152}
                      alt="Commission remittance QR"
                    />
                    <span className="sb-invoice__qr-mark" aria-hidden>
                      <QrCenterNetworkMark network={network} />
                    </span>
                  </>
                ) : (
                  <div className="sb-invoice__qr-missing">QR unavailable</div>
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
                          {networkDisplay}
                        </span>
                      </span>
                    </p>
                  </div>
                  <div className="sb-invoice__remit-field sb-invoice__remit-field--amt">
                    <span className="sb-invoice__remit-field-label">Amount</span>
                    <p className="sb-invoice__remit-amt">
                      <span className="sb-invoice__remit-amt-num">
                        {moneyPlain(slip.commissionAmount)}
                      </span>
                      <span className="sb-invoice__remit-amt-unit">{asset}</span>
                    </p>
                  </div>
                </div>
                <dl className="sb-invoice__remit-dl">
                  <div>
                    <dt>Payout address</dt>
                    <dd>
                      <CopyableChainValue
                        value={dest.address}
                        network={remittanceNetwork({ network })}
                        kind="address"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Invoice link</dt>
                    <dd>
                      <Link className="sb-invoice__guest-link" to={invoicePath}>
                        {displayCommissionInvoiceId(slip.id)}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Tx hash</dt>
                    <dd>
                      {txHash ? (
                        <CopyableChainValue
                          value={txHash}
                          network={remittanceNetwork(slip)}
                          kind="tx"
                        />
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            <p className="sb-invoice__remit-missing">{missingAddressHint}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
