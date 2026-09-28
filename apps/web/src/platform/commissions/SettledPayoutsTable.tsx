import { Link } from "react-router-dom";
import { formatViewerDateTime } from "../../shared/dateTime";
import { formatCommissionPeriodLabel } from "../../commercial/commissionStatements";
import type { CommissionPayoutRecord } from "../../commercial/commissionPayoutRecords";
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
  commissionBadgeTone,
  commissionStatusLabel,
  type HistorySortKey,
} from "./commissionsShared";

export function SettledPayoutsTable({
  rows,
  historySort,
  onHistorySort,
  portal,
  route,
  orgIcons,
  openInvoice,
}: {
  rows: CommissionPayoutRecord[];
  historySort: SortState<HistorySortKey>;
  onHistorySort: (key: HistorySortKey) => void;
  portal: CommissionsPortal | null;
  route: (path?: string) => string;
  orgIcons: Map<string, string | null>;
  openInvoice: (record: CommissionPayoutRecord) => void;
}) {
  return (
    <table className="plat-bills__table plat-commissions__table plat-commissions__table--history">
      <colgroup>
        <col className="plat-commissions__col-agent" />
        <col className="plat-commissions__col-num" />
        <col className="plat-commissions__col-period" />
        <col className="plat-commissions__col-settled" />
        <col className="plat-commissions__col-addr" />
        <col className="plat-commissions__col-tx" />
        <col className="plat-commissions__col-status" />
        <col className="plat-commissions__col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>
            <SortHeader
              label="Agent"
              sortKey="agent"
              sort={historySort}
              onSort={onHistorySort}
            />
          </th>
          <th className="plat-commissions__th-num">
            <SortHeader
              label="Amount"
              sortKey="amount"
              sort={historySort}
              onSort={onHistorySort}
              align="center"
            />
          </th>
          <th className="plat-commissions__th-center">
            <SortHeader
              label="Period"
              sortKey="period"
              sort={historySort}
              onSort={onHistorySort}
              align="center"
            />
          </th>
          <th className="plat-commissions__th-center">
            <SortHeader
              label="Settled at"
              sortKey="paidAt"
              sort={historySort}
              onSort={onHistorySort}
              align="center"
            />
          </th>
          <th className="plat-commissions__th-center">
            <SortHeader
              label="Address"
              sortKey="address"
              sort={historySort}
              onSort={onHistorySort}
              align="center"
            />
          </th>
          <th>
            <SortHeader
              label="Tx / ref"
              sortKey="tx"
              sort={historySort}
              onSort={onHistorySort}
            />
          </th>
          <th className="plat-commissions__th-center">
            <SortHeader
              label="Status"
              sortKey="status"
              sort={historySort}
              onSort={onHistorySort}
              align="center"
            />
          </th>
          <th className="plat-bills__th-actions">
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => {
          const href = route(`commissions/${h.id}`);
          return (
            <tr
              key={h.id}
              className="plat-bills__row plat-commissions__row--review"
              onClick={(e) => {
                if (
                  (e.target as HTMLElement).closest(
                    "a, button, input, .chain-value",
                  )
                ) {
                  return;
                }
                openInvoice(h);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openInvoice(h);
                }
              }}
              tabIndex={0}
              aria-label={`Review ${formatCommissionPeriodLabel(h.periodKey)} invoice for ${h.payeeName}`}
            >
              <td
                className="plat-bills__merchant"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="plat-bills__merchant-cell">
                  <AgentOrgAvatar
                    name={h.payeeName}
                    iconKey={orgIcons.get(h.payeeOrgId)}
                  />
                  <span className="plat-bills__merchant-meta">
                    <Link
                      className="plat-bills__merchant-name"
                      to={
                        portal
                          ? route(`accounts/${h.payeeOrgId}`)
                          : platformRoute(
                              `accounts/agents/${h.payeeOrgId}`,
                            )
                      }
                    >
                      {h.payeeName}
                    </Link>
                    <Link
                      className="plat-bills__id"
                      to={href}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {displayCommissionInvoiceId(h.id)}
                    </Link>
                  </span>
                </span>
              </td>
              <td className="plat-commissions__num plat-commissions__num--emph">
                <FundAmount amount={h.commissionAmount} />
              </td>
              <td className="plat-commissions__period">
                {formatCommissionPeriodLabel(h.periodKey)}
              </td>
              <td className="plat-commissions__paid-at">
                {h.settledAt || h.paidAt
                  ? formatViewerDateTime(
                      h.settledAt ?? h.paidAt!,
                    )
                  : "—"}
              </td>
              <td
                className="plat-commissions__addr"
                onClick={(e) => e.stopPropagation()}
              >
                <CopyableChainValue
                  value={h.payoutAddress}
                  network={remittanceNetwork(h)}
                  kind="address"
                />
              </td>
              <td
                className="plat-commissions__tx"
                onClick={(e) => e.stopPropagation()}
              >
                <CopyableChainValue
                  value={
                    displayServiceBillTxHash(h.txRef) || null
                  }
                  network={remittanceNetwork(h)}
                  kind="tx"
                  display={
                    h.txRef
                      ? truncateAddress(
                          displayServiceBillTxHash(h.txRef),
                          8,
                          6,
                        )
                      : undefined
                  }
                />
              </td>
              <td className="plat-bills__status-cell">
                <span
                  className={`plat-bills__badge tone-${commissionBadgeTone(h.payoutStatus)}`}
                >
                  {commissionStatusLabel(h.payoutStatus)}
                </span>
              </td>
              <td className="plat-bills__td-actions">
                <Link
                  className="plat-bills__row-more"
                  to={href}
                  aria-label={`Open invoice ${formatCommissionPeriodLabel(h.periodKey)}`}
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
