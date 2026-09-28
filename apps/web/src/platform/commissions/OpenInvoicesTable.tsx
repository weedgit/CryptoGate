import { Link } from "react-router-dom";
import { formatCommissionPeriodLabel } from "../../commercial/commissionStatements";
import type { CommissionPayoutRecord } from "../../commercial/commissionPayoutRecords";
import { formatCommissionPaidAgingHint } from "../../commercial/commissionAging";
import {
  remittanceNetwork,
  displayCommissionInvoiceId,
} from "../../commercial/commissionInvoiceShared";
import { displayServiceBillTxHash } from "../../shared/serviceBillPeriod";
import { platformRoute } from "../../shared/portalRouting";
import { CopyableChainValue } from "../../shared/CopyableChainValue";
import type { CommissionsPortal } from "../commissionsPortal";
import { FundAmount } from "../FundAmount";
import { truncateAddress } from "../orgDetailSeeds";
import { SortHeader, type SortState } from "../ui/TableArrange";
import { AgentOrgAvatar, RowMoreIcon } from "./CommissionRowParts";
import {
  BATCH_MARK_PAID_MAX,
  commissionBadgeTone,
  commissionStatusLabel,
  type InvoiceSortKey,
} from "./commissionsShared";

export function OpenInvoicesTable({
  rows,
  canBulkPay,
  issuedOnPage,
  selectedIds,
  toggleSelected,
  invoiceSort,
  onInvoiceSort,
  portal,
  route,
  orgIcons,
  openInvoice,
}: {
  rows: CommissionPayoutRecord[];
  canBulkPay: boolean;
  issuedOnPage: string[];
  selectedIds: Set<string>;
  toggleSelected: (ids: string[], on: boolean) => void;
  invoiceSort: SortState<InvoiceSortKey>;
  onInvoiceSort: (key: InvoiceSortKey) => void;
  portal: CommissionsPortal | null;
  route: (path?: string) => string;
  orgIcons: Map<string, string | null>;
  openInvoice: (record: CommissionPayoutRecord) => void;
}) {
  return (
    <table className="plat-bills__table plat-commissions__table">
      <colgroup>
        {canBulkPay ? <col className="plat-commissions__col-select" /> : null}
        <col className="plat-commissions__col-agent" />
        <col className="plat-commissions__col-period" />
        <col className="plat-commissions__col-num" />
        <col className="plat-commissions__col-rate" />
        <col className="plat-commissions__col-num" />
        <col className="plat-commissions__col-status" />
        <col className="plat-commissions__col-tx" />
        <col className="plat-commissions__col-actions" />
      </colgroup>
      <thead>
        <tr>
          {canBulkPay ? (
            <th className="plat-commissions__th-select">
              <input
                type="checkbox"
                aria-label="Select issued invoices on this page"
                disabled={issuedOnPage.length === 0}
                checked={
                  issuedOnPage.length > 0 &&
                  issuedOnPage.every((id) => selectedIds.has(id))
                }
                onChange={(e) => toggleSelected(issuedOnPage, e.target.checked)}
              />
            </th>
          ) : null}
          <th>
            <SortHeader
              label="Agent"
              sortKey="agent"
              sort={invoiceSort}
              onSort={onInvoiceSort}
            />
          </th>
          <th className="plat-commissions__th-center">
            <SortHeader
              label="Period"
              sortKey="period"
              sort={invoiceSort}
              onSort={onInvoiceSort}
              align="center"
            />
          </th>
          <th className="plat-commissions__th-num">
            <SortHeader
              label="Fee base"
              sortKey="fee"
              sort={invoiceSort}
              onSort={onInvoiceSort}
              align="center"
            />
          </th>
          <th className="plat-commissions__th-num">
            <SortHeader
              label="Rate"
              sortKey="rate"
              sort={invoiceSort}
              onSort={onInvoiceSort}
              align="center"
            />
          </th>
          <th className="plat-commissions__th-num">
            <SortHeader
              label="Commission"
              sortKey="commission"
              sort={invoiceSort}
              onSort={onInvoiceSort}
              align="center"
            />
          </th>
          <th className="plat-commissions__th-center">
            <SortHeader
              label="Status"
              sortKey="status"
              sort={invoiceSort}
              onSort={onInvoiceSort}
              align="center"
            />
          </th>
          <th>
            <SortHeader
              label="Tx hash"
              sortKey="tx"
              sort={invoiceSort}
              onSort={onInvoiceSort}
            />
          </th>
          <th className="plat-bills__th-actions">
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const txHash = displayServiceBillTxHash(row.txRef);
          const aging =
            row.payoutStatus === "paid"
              ? formatCommissionPaidAgingHint(row.paidAt)
              : null;
          const href = route(`commissions/${row.id}`);
          return (
            <tr
              key={row.id}
              className="plat-bills__row plat-commissions__row--review"
              onClick={(e) => {
                if (
                  (e.target as HTMLElement).closest(
                    "a, button, input, .chain-value",
                  )
                ) {
                  return;
                }
                openInvoice(row);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openInvoice(row);
                }
              }}
              tabIndex={0}
              aria-label={`Open ${formatCommissionPeriodLabel(row.periodKey)} invoice for ${row.payeeName}`}
            >
              {canBulkPay ? (
                <td
                  className="plat-commissions__td-select"
                  onClick={(e) => e.stopPropagation()}
                >
                  {row.payoutStatus === "issued" ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.payeeName} ${formatCommissionPeriodLabel(row.periodKey)}`}
                      checked={selectedIds.has(row.id)}
                      disabled={
                        !selectedIds.has(row.id) &&
                        selectedIds.size >= BATCH_MARK_PAID_MAX
                      }
                      onChange={(e) => toggleSelected([row.id], e.target.checked)}
                    />
                  ) : null}
                </td>
              ) : null}
              <td
                className="plat-bills__merchant"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="plat-bills__merchant-cell">
                  <AgentOrgAvatar
                    name={row.payeeName}
                    iconKey={orgIcons.get(row.payeeOrgId)}
                  />
                  <span className="plat-bills__merchant-meta">
                    <Link
                      className="plat-bills__merchant-name"
                      to={
                        portal
                          ? route(`accounts/${row.payeeOrgId}`)
                          : platformRoute(
                              `accounts/agents/${row.payeeOrgId}`,
                            )
                      }
                    >
                      {row.payeeName}
                    </Link>
                    <Link
                      className="plat-bills__id"
                      to={href}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {displayCommissionInvoiceId(row.id)}
                    </Link>
                  </span>
                </span>
              </td>
              <td className="plat-commissions__period">
                {formatCommissionPeriodLabel(row.periodKey)}
              </td>
              <td className="plat-commissions__num">
                <FundAmount amount={row.platformFeeCollected} />
              </td>
              <td className="plat-commissions__rate-cell">
                {row.commissionPercent}%
              </td>
              <td className="plat-commissions__num plat-commissions__num--emph">
                <FundAmount amount={row.commissionAmount} />
              </td>
              <td className="plat-bills__status-cell">
                <span className="plat-bills__status-row">
                  <span
                    className={`plat-bills__badge tone-${commissionBadgeTone(row.payoutStatus)}${
                      aging ? " is-pulse" : ""
                    }`}
                  >
                    {commissionStatusLabel(row.payoutStatus)}
                  </span>
                  {portal?.canConfirmReceipt &&
                  row.payoutStatus === "paid" ? (
                    <button
                      type="button"
                      className="plat-bills__kind-chip is-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInvoice(row);
                      }}
                    >
                      Confirm receipt
                    </button>
                  ) : null}
                </span>
                {aging ? (
                  <span
                    className="muted plat-commissions__aging"
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      marginTop: 2,
                    }}
                  >
                    {aging}
                  </span>
                ) : null}
              </td>
              <td
                className="plat-commissions__tx"
                onClick={(e) => e.stopPropagation()}
              >
                <CopyableChainValue
                  value={txHash || null}
                  network={remittanceNetwork(row)}
                  kind="tx"
                  display={
                    txHash
                      ? truncateAddress(txHash, 8, 6)
                      : undefined
                  }
                />
              </td>
              <td className="plat-bills__td-actions">
                <Link
                  className="plat-bills__row-more"
                  to={href}
                  aria-label={`Open invoice ${formatCommissionPeriodLabel(row.periodKey)}`}
                  title="Open invoice"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowMoreIcon />
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
