import { Link } from "react-router-dom";
import type { CommissionPreview } from "../../shared/dashboardApi";
import { OrgBrandMark } from "../../shared/OrgBrandMark";
import {
  billingScheduleCell,
  commissionBillCell,
  formatUsd2,
  formatUtcDay,
  merchantStatusLabel,
} from "./commissionPreviewModel";

type Props = {
  preview: CommissionPreview | null;
  route: (subpath?: string) => string;
  canOnboard: boolean;
};

/** Agent dashboard: this month's commission per merchant, built like the day-C invoice. */
export function CommissionByMerchantPanel({ preview, route, canOnboard }: Props) {
  if (!preview || !preview.eligible) return null;
  const { totals, merchants, commissionPercent } = preview;

  return (
    <section className="pg-commission-panel" aria-labelledby="pg-commission-title">
      <header className="pg-commission-panel__head">
        <div className="overview-charts__heading">
          <h2 id="pg-commission-title" className="overview-charts__title">
            Commission this month
          </h2>
          <p className="overview-charts__subtitle">
            {preview.periodLabel} (UTC) · estimate until the invoice is issued on{" "}
            {formatUtcDay(preview.invoiceDate)}
          </p>
        </div>
        <div className="pg-commission-panel__sum">
          <div className="pg-commission-panel__figure">
            <span className="pg-commission-panel__label">
              Estimated commission
              <span className="plat-card-help pg-commission-panel__help">
                <button
                  type="button"
                  className="plat-card-help__btn"
                  aria-label="How commission is calculated"
                  aria-describedby="pg-commission-how"
                >
                  ?
                </button>
                <span id="pg-commission-how" className="plat-card-help__tip" role="tooltip">
                  <strong>How it’s calculated:</strong> commission = (subscription + volume fee on
                  merchant bills <em>paid</em> this month) × {commissionPercent}%. Activation fees
                  are not included. Site volume is billed to the parent merchant.
                </span>
              </span>
            </span>
            <span className="pg-commission-panel__formula">
              {formatUsd2(totals.baseUsd)} paid fees × {commissionPercent}% =
            </span>
            <strong className="fund-amount">{formatUsd2(totals.commissionUsd)}</strong>
          </div>
          <Link className="pg-commission-panel__more" to={route("commissions")}>
            View Commissions →
          </Link>
        </div>
      </header>

      {totals.openBills > 0 ? (
        <p className="pg-commission-panel__alert" role="status">
          {totals.openBills} unpaid merchant bill{totals.openBills === 1 ? "" : "s"} (
          {formatUsd2(totals.openBillsUsd)}) are not counted yet. Commission counts once they’re
          paid.{" "}
          <Link to={route("service-bills")}>Review bills →</Link>
        </p>
      ) : null}

      {merchants.length === 0 ? (
        <p className="pg-commission-panel__empty muted">
          No merchants yet.
          {canOnboard ? (
            <>
              {" "}
              <Link to={route("merchants/new")}>Onboard a merchant →</Link>
            </>
          ) : null}
        </p>
      ) : (
        <div className="pg-commission-panel__scroll">
          <table className="pg-commission-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Status</th>
                <th>Billing schedule</th>
                <th className="is-num">Transactions</th>
                <th className="is-num">Volume</th>
                <th>Bill</th>
                <th className="is-num">Fee base</th>
                <th className="is-num">Commission</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => {
                const bill = commissionBillCell(m);
                const schedule = billingScheduleCell(m);
                const billHref = bill.billId
                  ? route(`service-bills/${encodeURIComponent(bill.billId)}`)
                  : route(`service-bills?merchant=${encodeURIComponent(m.orgId)}`);
                return (
                  <tr key={m.orgId}>
                    <td>
                      <span className="pg-commission-table__merchant-cell">
                        <OrgBrandMark
                          name={m.name}
                          iconKey={m.iconKey}
                          size={32}
                          className="pg-commission-table__avatar"
                        />
                        <span className="pg-commission-table__merchant-meta">
                          <Link
                            className="pg-commission-table__merchant"
                            to={route(`accounts/merchants/${encodeURIComponent(m.orgId)}`)}
                          >
                            {m.name}
                          </Link>
                          {m.siteCount > 0 ? (
                            <span className="pg-commission-table__note">
                              {m.siteCount} site{m.siteCount === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`pg-commission-status is-${m.status}`}>
                        {merchantStatusLabel(m.status)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`pg-commission-table__schedule${schedule.pending ? " is-pending" : ""}`}
                      >
                        {schedule.label}
                      </span>
                      <span className="pg-commission-table__note">{schedule.note}</span>
                    </td>
                    <td className="is-num mono">{m.transactions.toLocaleString()}</td>
                    <td className="is-num mono">{formatUsd2(m.volumeUsd)}</td>
                    <td>
                      <Link className={`pg-commission-bill is-${bill.tone}`} to={billHref}>
                        {bill.label}
                      </Link>
                      <span className="pg-commission-table__note">{bill.note}</span>
                    </td>
                    <td className="is-num mono">
                      {formatUsd2(m.baseUsd)}
                      {m.baseUsd > 0 ? (
                        <span className="pg-commission-table__note">
                          {formatUsd2(m.subscriptionUsd)} sub + {formatUsd2(m.volumeFeeUsd)} vol
                        </span>
                      ) : null}
                    </td>
                    <td className="is-num mono pg-commission-table__commission">
                      {formatUsd2(m.commissionUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  Total · {totals.merchants} merchant{totals.merchants === 1 ? "" : "s"}
                </td>
                <td />
                <td />
                <td className="is-num mono">{totals.transactions.toLocaleString()}</td>
                <td className="is-num mono">{formatUsd2(totals.volumeUsd)}</td>
                <td />
                <td className="is-num mono">{formatUsd2(totals.baseUsd)}</td>
                <td className="is-num mono pg-commission-table__commission">
                  {formatUsd2(totals.commissionUsd)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
