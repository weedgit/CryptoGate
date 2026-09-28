import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { OrgBrandMark } from "../../shared/OrgBrandMark";
import { formatSlashDate } from "../../shared/serviceBillPeriod";
import type { UpcomingServiceBill } from "../../shared/serviceBillsServer";
import { FundAmount } from "../FundAmount";
import { OrgListPagination } from "../OrgListPagination";

const PAGE_SIZE = 10;
const DAY_MS = 86_400_000;

/** "Today", "In 3 days", "5 days ago" from a UTC calendar day. */
export function upcomingRelativeDay(invoiceOn: string, now = new Date()): string {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.parse(`${invoiceOn}T00:00:00Z`);
  if (!Number.isFinite(day)) return "";
  const diff = Math.round((day - today) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `In ${diff} days`;
  return diff === -1 ? "1 day ago" : `${-diff} days ago`;
}

export function upcomingStatus(bill: UpcomingServiceBill): { label: string; tone: string } {
  if (bill.paused) return { label: "Paused", tone: "muted" };
  if (bill.late) return { label: "Overdue to issue", tone: "anomaly" };
  if (bill.waived) return { label: "Will be waived", tone: "muted" };
  return { label: "Upcoming", tone: "teal" };
}

type Props = {
  items: UpcomingServiceBill[];
  loading: boolean;
  query: string;
  merchantHref: (orgId: string) => string | null;
};

export function UpcomingBillsTable({ items, loading, query, merchantHref }: Props) {
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () => (q ? items.filter((b) => b.orgName.toLowerCase().includes(q)) : items),
    [items, q],
  );
  const [pageState, setPageState] = useState({ key: q, page: 1 });
  const page = pageState.key === q ? pageState.page : 1;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading && items.length === 0) return null;

  if (rows.length === 0) {
    return (
      <div className="plat-bills__empty" role="status">
        <span className="plat-bills__empty-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="5" width="17" height="15" rx="2" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
            <path d="M12 13.5v3l2 1" />
          </svg>
        </span>
        <h3 className="plat-bills__empty-title">
          {q ? "No matching merchants" : "No upcoming bills"}
        </h3>
        <p className="plat-bills__empty-body">
          {q
            ? `No activated merchant matches “${query.trim()}”.`
            : "Upcoming bills appear once a merchant pays the activation fee and has a billing schedule."}
        </p>
      </div>
    );
  }

  return (
    <>
      <table className="plat-bills__table plat-bills__table--upcoming">
        <thead>
          <tr>
            <th className="plat-bills__th-merchant">Merchant</th>
            <th title="Estimates on volume so far. The final amount is set when the bill is issued at 00:00 UTC on the bill date.">
              Estimated amount
            </th>
            <th>Volume so far</th>
            <th>Billing period</th>
            <th>Bill date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((bill, index) => {
            const href = merchantHref(bill.orgId);
            const status = upcomingStatus(bill);
            const credit = Number(bill.creditAppliedUsd) > 0;
            return (
              <tr
                key={bill.orgId}
                className="plat-bills__row is-estimate"
                style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
              >
                <td className="plat-bills__merchant">
                  <span className="plat-bills__merchant-cell">
                    <OrgBrandMark
                      name={bill.orgName}
                      iconKey={bill.iconKey}
                      size={36}
                      className="plat-bills__merchant-avatar plat-bills__merchant-avatar--brand"
                    />
                    <span className="plat-bills__merchant-meta">
                      {href ? (
                        <Link className="plat-bills__merchant-name" to={href}>
                          {bill.orgName}
                        </Link>
                      ) : (
                        <span className="plat-bills__merchant-name">{bill.orgName}</span>
                      )}
                      <span className="plat-bills__id">Estimate</span>
                    </span>
                  </span>
                </td>
                <td className="plat-bills__amount-cell">
                  <span className="plat-bills__amount plat-bills__amount--total">
                    <FundAmount amount={bill.payableAmount} />
                  </span>
                  <span className="plat-bills__fee-parts">
                    <FundAmount amount={bill.subscriptionAmount} />
                    {" + "}
                    <FundAmount amount={bill.volumeFeeAmount} />
                    {credit ? (
                      <>
                        {" − "}
                        <FundAmount amount={bill.creditAppliedUsd} /> credit
                      </>
                    ) : null}
                  </span>
                </td>
                <td className="plat-bills__amount plat-bills__amount--base">
                  <FundAmount amount={bill.billedVolumeUsd} />
                  <span className="plat-bills__fee-parts">{bill.volumeFeePercent}% fee</span>
                </td>
                <td className="plat-bills__created">
                  <span className="plat-bills__period">
                    <span className="plat-bills__period-line">
                      {formatSlashDate(bill.periodStart)}
                      <span className="plat-bills__period-sep" aria-hidden>
                        {" "}
                        –
                      </span>
                    </span>
                    <span className="plat-bills__period-end">{formatSlashDate(bill.periodEnd)}</span>
                  </span>
                </td>
                <td className={bill.late ? "plat-bills__due is-overdue" : "plat-bills__due"}>
                  {formatSlashDate(bill.invoiceOn)}
                  <span className="plat-bills__fee-parts">{upcomingRelativeDay(bill.invoiceOn)}</span>
                </td>
                <td className="plat-bills__status-cell">
                  <span className={`plat-bills__badge tone-${status.tone}`}>{status.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > PAGE_SIZE ? (
        <OrgListPagination
          page={page}
          pageCount={pageCount}
          total={rows.length}
          pageSize={PAGE_SIZE}
          onPageChange={(next) => setPageState({ key: q, page: next })}
        />
      ) : null}
    </>
  );
}
