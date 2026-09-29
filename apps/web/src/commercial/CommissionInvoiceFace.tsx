import { type ReactNode, type Ref } from "react";
import { Link } from "react-router-dom";
import { platformInvoiceSeller } from "../billing/ServiceBillInvoiceFace";
import {
  IconFactCalendar,
  IconFactCurrency,
  IconFactPeriod,
  IconFactRate,
  InvoiceAddress,
  InvoiceBrandHead,
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
  type InvoiceDlRow,
  type InvoiceParty,
  type InvoiceSeller,
} from "../billing/invoiceParts";
import { explorerTxUrl } from "../shared/chainExplorer";
import { displayServiceBillTxHash } from "../shared/serviceBillPeriod";
import { formatCommissionPeriodLabel } from "./commissionStatements";
import {
  commissionPayoutRemittanceUri,
  type CommissionPayoutRecord,
  type CommissionTreeMerchantLine,
} from "./commissionPayoutRecords";
import {
  displayCommissionInvoiceId,
  invoiceStatusLabel,
  invoiceStatusTone,
  remittanceNetwork,
  type CommissionInvoiceDest,
} from "./commissionInvoiceShared";

type OrgParentLookup = { parentId?: string | null };

/** Commission invoices are denominated in USD and remitted 1:1 in the payout asset. */
const COMMISSION_CURRENCY = "USD";

function centsRound(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Same rounding as the API: fee × (percent in basis points), to the cent. */
function lineCommission(feeBase: number, commissionPercent: string): number {
  const bps = Math.round(Number(commissionPercent) * 100) || 0;
  return centsRound(feeBase * (bps / 10_000));
}

function lineFeeBase(line: CommissionTreeMerchantLine): number {
  const total = centsRound((line.subscriptionAmount || 0) + (line.volumeFeeAmount || 0));
  return total > 0 ? total : 0;
}

type Props = {
  slip: CommissionPayoutRecord;
  dest: CommissionInvoiceDest | null;
  /** Agent receiving the commission; falls back to the payee name on the slip. */
  payee?: InvoiceParty | null;
  seller?: InvoiceSeller;
  /** Which portal is viewing — drives the "payment sent" note. */
  viewerPortal?: "platform" | "agent";
  byId?: Map<string, OrgParentLookup>;
  orgHref?: (
    type: string,
    orgId: string,
    parentId: string | null,
  ) => string | null;
  statusBadge?: ReactNode;
  toolbar?: ReactNode;
  missingAddressHint?: string;
  invoiceRef?: Ref<HTMLElement>;
};

/**
 * Paper invoice face for platform → agent commission payouts, built on the
 * platform fee invoice layout. Print targets `.sb-invoice` via CSS.
 */
export function CommissionInvoiceFace({
  slip,
  dest,
  payee,
  seller = platformInvoiceSeller(),
  viewerPortal = "platform",
  byId,
  orgHref,
  statusBadge,
  toolbar,
  missingAddressHint = "No payout address on this agent yet.",
  invoiceRef,
}: Props) {
  const asset = dest?.asset ?? slip.asset ?? "USDT";
  const network = dest?.network ?? slip.network ?? "tron";
  const payoutNetwork = remittanceNetwork({ network });
  const txNetwork = remittanceNetwork(slip);
  const qrPayload = dest?.address
    ? commissionPayoutRemittanceUri({
        address: dest.address,
        amount: slip.commissionAmount,
        asset: dest.asset,
        network: dest.network,
      }) || dest.address
    : null;
  const sent = slip.payoutStatus === "paid";
  const settled = slip.payoutStatus === "settled";
  const paid = sent || settled;
  const payable = slip.payoutStatus === "issued";
  const txHash = displayServiceBillTxHash(slip.txRef);
  const explorerUrl = txHash ? explorerTxUrl(network, txHash) : null;
  const merchants = slip.treeSnapshot?.merchants ?? [];
  const included = merchants.filter((m) => m.includedInCommission && lineFeeBase(m) > 0);
  const excluded = merchants.filter((m) => !included.includes(m));
  const linesTotal = centsRound(
    included.reduce((sum, m) => sum + lineCommission(lineFeeBase(m), slip.commissionPercent), 0),
  );
  const rounding = centsRound(slip.commissionAmount - linesTotal);
  const amountWithAsset = `${invoiceMoneyPlain(slip.commissionAmount)} ${asset}`;

  const merchantName = (line: CommissionTreeMerchantLine) => {
    const parentId = byId?.get(line.orgId)?.parentId ?? null;
    const href = orgHref?.(line.type, line.orgId, parentId) ?? null;
    return href ? (
      <Link className="sb-invoice__guest-link" to={href}>
        {line.name}
      </Link>
    ) : (
      line.name
    );
  };

  const proofRows: InvoiceDlRow[] = [
    { label: "Amount", value: amountWithAsset },
    { label: "Tx hash", value: <InvoiceTxHash txHash={txHash} network={txNetwork} /> },
    ...(explorerUrl
      ? [{ label: "Explorer", value: <InvoiceExplorerLink href={explorerUrl} /> }]
      : []),
    {
      label: "Payout address",
      value: <InvoiceAddress address={dest?.address} network={payoutNetwork} />,
    },
    ...(slip.note?.trim() ? [{ label: "Note", value: slip.note.trim(), span: true }] : []),
  ];

  return (
    <InvoicePaper invoiceRef={invoiceRef} toolbar={toolbar}>
      <InvoiceBrandHead
        seller={seller}
        subtitle="Platform Commission Invoice"
        docId={displayCommissionInvoiceId(slip.id)}
        statusBadge={
          statusBadge ?? (
            <span
              className={`plat-commissions__status is-${invoiceStatusTone(slip.payoutStatus)}`}
            >
              {invoiceStatusLabel(slip.payoutStatus)}
            </span>
          )
        }
      />

      <InvoicePartyFacts
        title="Payee"
        party={payee ?? { name: slip.payeeName }}
        facts={[
          {
            icon: <IconFactCalendar />,
            label: "Issue date",
            value: <InvoiceZonedDate iso={slip.createdAt} />,
          },
          {
            icon: <IconFactPeriod />,
            label: "Billing period",
            value: formatCommissionPeriodLabel(slip.periodKey),
            className: "sb-invoice__fact-period",
          },
          {
            icon: <IconFactRate />,
            label: "Commission rate",
            value: `${slip.commissionPercent}%`,
          },
          {
            icon: <IconFactCurrency />,
            label: "Currency",
            value: COMMISSION_CURRENCY,
          },
        ]}
      />

      <InvoiceLines columns={["Description", "Fee base", "Rate", "Amount"]}>
        {included.map((line) => {
          const base = lineFeeBase(line);
          return (
            <tr key={line.orgId}>
              <td>
                {merchantName(line)}
                <span className="sb-invoice__line-note">
                  Platform fees paid · subscription{" "}
                  {invoiceMoney(line.subscriptionAmount, COMMISSION_CURRENCY)} + volume fee{" "}
                  {invoiceMoney(line.volumeFeeAmount, COMMISSION_CURRENCY)}
                </span>
              </td>
              <td>{invoiceMoney(base, COMMISSION_CURRENCY)}</td>
              <td>{slip.commissionPercent}%</td>
              <td className="sb-invoice__amt">
                {invoiceMoney(
                  lineCommission(base, slip.commissionPercent),
                  COMMISSION_CURRENCY,
                )}
              </td>
            </tr>
          );
        })}
        {excluded.map((line) => (
          <tr key={line.orgId}>
            <td>
              {merchantName(line)}
              <span className="sb-invoice__line-note">
                Not included — no platform fee paid this period
              </span>
            </td>
            <td>—</td>
            <td>—</td>
            <td className="sb-invoice__amt muted">
              {invoiceMoney(0, COMMISSION_CURRENCY)}
            </td>
          </tr>
        ))}
        {rounding !== 0 && included.length > 0 ? (
          <tr>
            <td>Rounding</td>
            <td>—</td>
            <td>—</td>
            <td className="sb-invoice__amt">
              {invoiceMoney(rounding, COMMISSION_CURRENCY)}
            </td>
          </tr>
        ) : null}
        {merchants.length === 0 ? (
          <tr>
            <td>
              Commission on platform fees
              <span className="sb-invoice__line-note">
                Merchant breakdown not recorded for this invoice
              </span>
            </td>
            <td>{invoiceMoney(slip.platformFeeCollected, COMMISSION_CURRENCY)}</td>
            <td>{slip.commissionPercent}%</td>
            <td className="sb-invoice__amt">
              {invoiceMoney(slip.commissionAmount, COMMISSION_CURRENCY)}
            </td>
          </tr>
        ) : null}
      </InvoiceLines>

      <InvoiceTotals
        dueLabel="Commission due"
        due={invoiceMoney(slip.commissionAmount, COMMISSION_CURRENCY)}
        paid={invoiceMoney(paid ? slip.commissionAmount : 0, COMMISSION_CURRENCY)}
        balance={invoiceMoney(paid ? 0 : slip.commissionAmount, COMMISSION_CURRENCY)}
      />

      {settled ? (
        <InvoiceReceipt
          title="Settlement receipt"
          rows={[
            { label: "Settled at", value: <InvoiceZonedDate iso={slip.settledAt} /> },
            { label: "Sent at", value: <InvoiceZonedDate iso={slip.paidAt} /> },
            ...proofRows,
          ]}
        />
      ) : null}

      {sent ? (
        <InvoiceReceipt
          title="Payment sent"
          note={
            viewerPortal === "agent"
              ? "Confirm receipt in the side panel to settle this invoice."
              : "Awaiting agent confirmation."
          }
          rows={[
            { label: "Sent at", value: <InvoiceZonedDate iso={slip.paidAt} /> },
            ...proofRows,
          ]}
        />
      ) : null}

      {payable ? (
        <InvoicePayCard
          title="Commission remittance"
          note={`Invoice is in ${COMMISSION_CURRENCY}. Settle the balance due by sending the same amount in ${asset} (1:1) to the agent payout address.`}
          qrPayload={qrPayload}
          qrAlt="Commission remittance QR"
          qrMissing="QR unavailable"
          asset={asset}
          network={network}
          amount={slip.commissionAmount}
          addressLabel="Payout address"
          address={dest?.address ?? null}
          missing={missingAddressHint}
        />
      ) : null}
    </InvoicePaper>
  );
}
