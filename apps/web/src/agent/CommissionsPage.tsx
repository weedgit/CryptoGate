import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import type { CommissionPayoutRecord } from "../commercial/commissionPayoutRecords";
import { FundAmount } from "../platform/FundAmount";
import { commissionBadgeTone } from "../platform/commissions/commissionsShared";
import { BillKpiIcon, type BillKpiAccent } from "../platform/ui/BillKpiIcon";
import { PagePending } from "../platform/ui/PlatformPending";
import { animateCardValue } from "../shared/AnimatedText";
import {
  listCommissionPayoutsServer,
  peekCommissionPayoutsServer,
  type CommissionPayoutsListParams,
} from "../shared/commissionsServer";
import {
  getCommissionPreview,
  peekCommissionPreview,
  type CommissionPreview,
} from "../shared/dashboardApi";
import { agentRoute } from "../shared/portalRouting";
import { formatSlashDate } from "../shared/serviceBillPeriod";
import { ApiError, getAgentCommission, type Session } from "./api";
import { primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";

type Props = { session: Session };

type Row = {
  key: string;
  periodKey: string;
  year: string;
  month: string;
  commission: number;
  base: number;
  percent: string;
  sentOn: string;
  status: string;
  statusLabel: string;
  payout: CommissionPayoutRecord | null;
};

/** An agent has at most one invoice per month; one server page covers decades. */
const LIST_LIMIT = 500;

function num(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

function usd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Commission months are UTC calendar months. */
function fmtMonth(periodKey: string): string {
  const d = new Date(`${periodKey.slice(0, 7)}-01T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return periodKey;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function statusLabel(status: string): string {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Sent";
  if (status === "settled") return "Received";
  return status;
}

function payoutRow(p: CommissionPayoutRecord): Row {
  return {
    key: p.id,
    periodKey: p.periodKey,
    year: p.periodKey.slice(0, 4),
    month: fmtMonth(p.periodKey),
    commission: num(p.commissionAmount),
    base: num(p.platformFeeCollected),
    percent: p.commissionPercent,
    sentOn: p.paidAt ?? "",
    status: p.payoutStatus,
    statusLabel: statusLabel(p.payoutStatus),
    payout: p,
  };
}

function KpiCard({
  accent,
  label,
  value,
  meta,
  action,
}: {
  accent: BillKpiAccent;
  label: string;
  value: ReactNode;
  meta: string;
  action?: ReactNode;
}) {
  return (
    <div className={`plat-bills__kpi-card is-${accent}`}>
      <div className="plat-bills__kpi-head">
        <span className="plat-bills__kpi-icon" aria-hidden>
          <BillKpiIcon accent={accent} />
        </span>
        <p className="plat-bills__kpi-label">{label}</p>
        {action}
      </div>
      <p className="plat-bills__kpi-value">{animateCardValue(value)}</p>
      <p className="plat-bills__kpi-meta">{meta}</p>
    </div>
  );
}

/** Agent Commissions — monthly PaymentGate commission, one row per month (Service Bills layout). */
export function CommissionsPage({ session }: Props) {
  const navigate = useNavigate();
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canConfirm = sessionCanOnboardMerchant(session);
  const listParams = useMemo<CommissionPayoutsListParams | null>(
    () =>
      agentId
        ? { payeeOrgId: agentId, sort: "period", dir: "desc", limit: LIST_LIMIT, offset: 0 }
        : null,
    [agentId],
  );
  const [payouts, setPayouts] = useState<CommissionPayoutRecord[] | null>(() =>
    listParams ? (peekCommissionPayoutsServer(listParams)?.items ?? null) : [],
  );
  const [preview, setPreview] = useState<CommissionPreview | null>(() =>
    agentId ? peekCommissionPreview(agentId) : null,
  );
  const [ratePercent, setRatePercent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<string>("all");

  useEffect(() => {
    if (!agentId || !listParams) return;
    let cancelled = false;
    void listCommissionPayoutsServer(listParams)
      .then((page) => {
        if (!cancelled) setPayouts(page.items);
      })
      .catch((err) => {
        if (cancelled) return;
        setPayouts((prev) => prev ?? []);
        setError(err instanceof ApiError ? err.message : "Could not load commissions");
      });
    void getCommissionPreview(agentId)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => undefined);
    void getAgentCommission(agentId)
      .then((c) => {
        if (!cancelled) setRatePercent(c.commissionPercent?.trim() || null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agentId, listParams]);

  const estimate = preview?.eligible ? preview : null;

  const rows = useMemo((): Row[] => {
    if (!payouts) return [];
    const out = payouts
      .map(payoutRow)
      .sort((a, b) => b.periodKey.localeCompare(a.periodKey));
    if (estimate && !payouts.some((p) => p.periodKey === estimate.periodKey)) {
      out.unshift({
        key: "upcoming",
        periodKey: estimate.periodKey,
        year: estimate.periodKey.slice(0, 4),
        month: fmtMonth(estimate.periodKey),
        commission: estimate.totals.commissionUsd,
        base: estimate.totals.baseUsd,
        percent: estimate.commissionPercent,
        sentOn: estimate.invoiceDate,
        status: "upcoming",
        statusLabel: "Upcoming",
        payout: null,
      });
    }
    return out;
  }, [payouts, estimate]);

  const years = useMemo(
    () => [...new Set(rows.map((r) => r.year).filter(Boolean))].sort().reverse(),
    [rows],
  );
  const recentYears = years.slice(0, 3);
  const olderYears = years.slice(3);
  const visibleRows = year === "all" ? rows : rows.filter((r) => r.year === year);

  const open = useMemo(
    () =>
      (payouts ?? [])
        .filter((p) => p.payoutStatus === "issued" || p.payoutStatus === "paid")
        .sort((a, b) => a.periodKey.localeCompare(b.periodKey)),
    [payouts],
  );
  const toConfirm = open.filter((p) => p.payoutStatus === "paid");
  const issuedCount = open.length - toConfirm.length;
  const owedTotal = open.reduce((sum, p) => sum + num(p.commissionAmount), 0);
  const received = (payouts ?? []).filter(
    (p) => p.payoutStatus === "settled" && (year === "all" || p.periodKey.startsWith(year)),
  );
  const receivedTotal = received.reduce((sum, p) => sum + num(p.commissionAmount), 0);
  const rate = estimate?.commissionPercent ?? ratePercent;
  const loading = payouts == null;

  const openPayout = (p: CommissionPayoutRecord) =>
    navigate(agentRoute(`commissions/${encodeURIComponent(p.id)}`));

  return (
    <div className="plat-bills">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <div className="plat-bills__period-bar">
        <div className="plat-bills__intro">
          <span className="plat-bills__intro-icon" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              width="36"
              height="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 7H5a2 2 0 0 1 0-4h13v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h15V7" />
              <path d="M16 14h.01" />
            </svg>
          </span>
          <div className="plat-bills__intro-copy">
            <h1 className="plat-bills__intro-title">Commissions</h1>
            <p className="plat-bills__intro-sub">
              Your share of paid PaymentGate fees from your merchants — one invoice per UTC
              month.
            </p>
          </div>
        </div>
        {years.length > 1 ? (
          <div className="plat-bills__period-tools">
            <div className="pg-dash__period" aria-label="Year">
              <div className="pg-dash__period-pills" role="group" aria-label="Year">
                {["all", ...recentYears].map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`pg-dash__period-pill${year === y ? " is-active" : ""}`}
                    onClick={() => setYear(y)}
                  >
                    {y === "all" ? "All" : y}
                  </button>
                ))}
                {olderYears.length > 0 ? (
                  <select
                    className={`pg-dash__period-pill pg-dash__period-select${
                      olderYears.includes(year) ? " is-active" : ""
                    }`}
                    value={olderYears.includes(year) ? year : ""}
                    onChange={(e) => setYear(e.target.value || "all")}
                    aria-label="Older years"
                  >
                    <option value="">Older</option>
                    {olderYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="plat-bills__kpi-carousel is-fit">
        <div className="plat-bills__kpi" role="group" aria-label="Commission summary">
          <KpiCard
            accent="blue"
            label="This month"
            value={
              estimate ? (
                <>
                  ~<FundAmount animate amount={estimate.totals.commissionUsd.toFixed(2)} />
                </>
              ) : (
                "—"
              )
            }
            meta={
              estimate
                ? `Invoiced ${formatSlashDate(estimate.invoiceDate)} · estimate`
                : preview
                  ? "No commission rate set"
                  : "Loading…"
            }
          />
          <KpiCard
            accent="warn"
            label="Owed to you"
            value={loading ? "—" : <FundAmount animate amount={owedTotal.toFixed(2)} />}
            meta={
              open.length === 0
                ? "Nothing outstanding"
                : [
                    issuedCount > 0 ? `${issuedCount} issued` : null,
                    toConfirm.length > 0 ? `${toConfirm.length} to confirm` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
            }
            action={
              canConfirm && toConfirm[0] ? (
                <button
                  type="button"
                  className="plat-bills__kpi-view"
                  onClick={() => openPayout(toConfirm[0])}
                >
                  <span className="plat-bills__kpi-view-text">Confirm</span>
                  <span className="plat-bills__kpi-view-arrow" aria-hidden>
                    →
                  </span>
                </button>
              ) : null
            }
          />
          <KpiCard
            accent="ok"
            label="Received"
            value={loading ? "—" : <FundAmount animate amount={receivedTotal.toFixed(2)} />}
            meta={[
              rate ? `${rate}% of paid fees` : null,
              year === "all" ? "All time" : year,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        </div>
      </div>

      <div className="plat-bills__panel plat-bills__panel--solo" aria-label="Commission by month">
        <div className="plat-bills__main">
          <div className="plat-bills__table-wrap">
            <div className="plat-bills__table-scroll">
              {loading ? <PagePending /> : null}
              {!loading && visibleRows.length === 0 ? (
                <p className="plat-bills__empty">
                  No commissions yet. An invoice appears here after each month your merchants
                  pay PaymentGate fees.
                </p>
              ) : null}
              {!loading && visibleRows.length > 0 ? (
                <table className="plat-bills__table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Commission</th>
                      <th>Paid fees</th>
                      <th>Sent on</th>
                      <th>Status</th>
                      <th className="plat-bills__th-actions">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, index) => {
                      const payout = row.payout;
                      const estimated = !payout;
                      const confirmable = Boolean(payout && canConfirm && row.status === "paid");
                      const tone = estimated ? "teal" : commissionBadgeTone(row.status);
                      return (
                        <tr
                          key={row.key}
                          className={`plat-bills__row${estimated ? " is-estimate" : ""}`}
                          style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
                          tabIndex={payout ? 0 : undefined}
                          role={payout ? "link" : undefined}
                          onClick={payout ? () => openPayout(payout) : undefined}
                          onKeyDown={
                            payout
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openPayout(payout);
                                  }
                                }
                              : undefined
                          }
                        >
                          <td className="plat-bills__month">{row.month}</td>
                          <td className="plat-bills__amount-cell">
                            <span className="plat-bills__amount plat-bills__amount--total">
                              {estimated ? "~" : ""}
                              <FundAmount amount={row.commission.toFixed(2)} />
                            </span>
                            {row.percent ? (
                              <span className="plat-bills__fee-parts">
                                {row.percent}% of {usd(row.base)}
                              </span>
                            ) : null}
                          </td>
                          <td className="plat-bills__amount plat-bills__amount--base">
                            <FundAmount amount={row.base.toFixed(2)} />
                          </td>
                          <td className="plat-bills__due">
                            {estimated
                              ? `Invoiced ${formatSlashDate(row.sentOn)}`
                              : formatSlashDate(row.sentOn)}
                          </td>
                          <td className="plat-bills__status-cell">
                            <span className="plat-bills__status-row">
                              <span className={`plat-bills__badge tone-${tone}`}>
                                {row.statusLabel}
                              </span>
                              {confirmable ? (
                                <button
                                  type="button"
                                  className="plat-bills__kind-chip is-action"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPayout(payout!);
                                  }}
                                >
                                  Confirm
                                </button>
                              ) : null}
                            </span>
                          </td>
                          <td className="plat-bills__td-actions">
                            {agentId ? (
                              <Link
                                className="plat-bills__review"
                                to={agentRoute(
                                  `service-bills?${new URLSearchParams({
                                    agent: agentId,
                                    paidMonth: row.periodKey,
                                  }).toString()}`,
                                )}
                                title="Merchant bills paid this month — the fee base"
                                aria-label={`Review fee base for ${row.month}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Review →
                              </Link>
                            ) : null}
                            {payout ? (
                              <button
                                type="button"
                                className="plat-bills__row-more"
                                aria-label="Open invoice"
                                title="Open invoice"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPayout(payout);
                                }}
                              >
                                <svg
                                  viewBox="0 0 16 16"
                                  width="16"
                                  height="16"
                                  fill="currentColor"
                                  aria-hidden
                                >
                                  <circle cx="8" cy="3.5" r="1.35" />
                                  <circle cx="8" cy="8" r="1.35" />
                                  <circle cx="8" cy="12.5" r="1.35" />
                                </svg>
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>
            {estimate && !loading ? (
              <p className="plat-bills__foot-note">
                ~ This month is an estimate from fees your merchants have paid so far. The
                invoice is issued on {formatSlashDate(estimate.invoiceDate)}; unpaid merchant
                bills are not counted.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
