import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { tierForMonthlyVolume, tierLabel } from "../commercialLabels";
import { getFeeTierSettings, type FeeTierBand } from "../platform/api";
import { FundAmount } from "../platform/FundAmount";
import { animateCardValue } from "../shared/AnimatedText";
import { BillKpiIcon, type BillKpiAccent } from "../platform/ui/BillKpiIcon";
import { PagePending } from "../platform/ui/PlatformPending";
import { getDashboardReports } from "../shared/dashboardApi";
import { merchantRoute } from "../shared/portalRouting";
import { formatSlashDate } from "../shared/serviceBillPeriod";
import {
  ApiError,
  getMerchantCommercial,
  listServiceBills,
  type MerchantCommercialSettings,
  type ServiceBill,
  type Session,
} from "./api";
import { parentMerchantOrgId, sessionCanCheckoutServiceBill } from "./org";
import { serviceBillStatusLabel, serviceBillStatusTone } from "./serviceBillStatus";

type Props = { session: Session };

type Estimate = {
  periodStart: string;
  periodEnd: string;
  invoiceOn: string;
  volumeUsd: number;
  tier: string;
  percent: string;
  automatic: boolean;
  subscription: number;
  volumeFee: number;
  credit: number;
  total: number;
  waived: boolean;
};

type Row = {
  key: string;
  year: string;
  month: string;
  activation: boolean;
  periodStart: string;
  periodEnd: string;
  subscription: number | null;
  volumeFee: number | null;
  volumeUsd: number | null;
  volumeDetail: string | null;
  total: number;
  totalTitle: string | null;
  dueOn: string;
  status: string;
  statusLabel: string;
  bill: ServiceBill | null;
};

const OPEN_STATUSES = new Set(["issued", "overdue"]);

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

function ymd(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : "";
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtMonth(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Server rounding: volume to cents, fee = volume × percent rounded down to the cent. */
function volumeFeeFor(volumeUsd: number, percent: string): number {
  const volCents = Math.round(volumeUsd * 100);
  const bps = Math.round(num(percent) * 10000);
  return Math.floor((volCents * bps) / 1_000_000) / 100;
}

function isMonthly(bill: ServiceBill): boolean {
  return (bill.billKind ?? "monthly") === "monthly";
}

function billRow(bill: ServiceBill): Row {
  const start = ymd(bill.periodStart);
  const activation = bill.billKind === "activation";
  const volume = num(bill.billedVolumeUsd);
  const pct = bill.volumeFeePercent;
  return {
    key: bill.id,
    year: start.slice(0, 4),
    month: activation ? "Activation" : fmtMonth(start),
    activation,
    periodStart: start,
    periodEnd: ymd(bill.periodEnd),
    subscription: activation ? null : num(bill.subscriptionAmount),
    volumeFee: activation ? null : num(bill.volumeFeeAmount),
    volumeUsd: activation ? null : volume,
    volumeDetail: !activation && pct ? `${usd(volume)} × ${pct}%` : null,
    total: bill.status === "waived" ? 0 : num(bill.totalAmount),
    totalTitle:
      bill.status === "waived"
        ? `Waived — ${usd(num(bill.totalAmount))} not charged`
        : num(bill.creditAppliedUsd) > 0
          ? `${usd(num(bill.creditAppliedUsd))} credit applied`
          : null,
    dueOn: ymd(bill.dueAt),
    status: bill.status,
    statusLabel: serviceBillStatusLabel(bill.status),
    bill,
  };
}

/** Current billing period: after the last monthly bill (or activation) up to the next invoice day. */
function upcomingWindow(
  commercial: MerchantCommercialSettings | null,
  bills: ServiceBill[],
): { start: string; end: string; invoiceOn: string } | null {
  const invoiceOn = ymd(commercial?.nextInvoiceOn);
  const anchor = ymd(commercial?.billingAnchorAt);
  if (!invoiceOn || !anchor) return null;
  const lastEnd = bills
    .filter((b) => isMonthly(b) && b.status !== "cancelled")
    .map((b) => ymd(b.periodEnd))
    .sort()
    .pop();
  const start = lastEnd ? addDays(lastEnd, 1) : anchor;
  const end = addDays(invoiceOn, -1);
  return { start, end: end < start ? start : end, invoiceOn };
}

/** Completed invoices in the bill's UTC-day period — the volume the fee is billed on. */
function volumeReviewHref(row: Row): string | null {
  if (row.activation || !row.periodStart) return null;
  const q = new URLSearchParams({
    status: "completed",
    period: "custom",
    from: row.periodStart,
    to: row.periodEnd || row.periodStart,
    utc: "1",
  });
  return `${merchantRoute("orders")}?${q.toString()}`;
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

function PeriodCell({ row }: { row: Row }) {
  if (row.activation) return <span>Activation fee</span>;
  if (!row.periodEnd || row.periodEnd === row.periodStart) {
    return <>{formatSlashDate(row.periodStart)}</>;
  }
  return (
    <span className="plat-bills__period">
      <span className="plat-bills__period-line">
        {formatSlashDate(row.periodStart)}
        <span className="plat-bills__period-sep" aria-hidden>
          {" "}
          –
        </span>
      </span>
      <span className="plat-bills__period-end">{formatSlashDate(row.periodEnd)}</span>
    </span>
  );
}

/** Merchant Service Bills — plan summary and one row per billing month. */
export function ServiceBillsListPage({ session }: Props) {
  const navigate = useNavigate();
  const orgId = useMemo(() => parentMerchantOrgId(session), [session]);
  const canPay = sessionCanCheckoutServiceBill(session);
  const [bills, setBills] = useState<ServiceBill[] | null>(null);
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(null);
  const [volumeUsd, setVolumeUsd] = useState<number | null>(null);
  const [feeTiers, setFeeTiers] = useState<FeeTierBand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listServiceBills(),
      orgId ? getMerchantCommercial(orgId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([rows, plan]) => {
        if (cancelled) return;
        setBills(rows);
        setCommercial(plan);
      })
      .catch((err) => {
        if (cancelled) return;
        setBills([]);
        setError(err instanceof ApiError ? err.message : "Could not load service bills");
      });
    void getFeeTierSettings()
      .then((settings) => {
        if (!cancelled) setFeeTiers(settings.tiers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const period = useMemo(
    () => (bills ? upcomingWindow(commercial, bills) : null),
    [bills, commercial],
  );

  useEffect(() => {
    if (!period) return;
    let cancelled = false;
    void getDashboardReports({ from: period.start, to: period.end })
      .then((r) => {
        if (!cancelled) setVolumeUsd(r.totals.settledVolumeUsd ?? 0);
      })
      .catch(() => {
        if (!cancelled) setVolumeUsd(0);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const estimate = useMemo((): Estimate | null => {
    if (!period || !commercial || volumeUsd == null) return null;
    const automatic = commercial.rateMode !== "fixed";
    const tier = automatic
      ? (tierForMonthlyVolume(volumeUsd, feeTiers) ?? commercial.tier)
      : commercial.tier;
    const band = automatic ? feeTiers.find((t) => t.tier === tier) : undefined;
    const percent = band?.defaultSignupPercent ?? commercial.volumeFeePercent;
    const subscription = num(band?.subscriptionAmountUsd ?? commercial.subscriptionAmountUsd);
    const volumeFee = volumeFeeFor(volumeUsd, percent);
    const waived = (commercial.waivedMonthsLeft ?? 0) > 0;
    const credit = num(commercial.serviceBillCreditUsd);
    const gross = subscription + volumeFee;
    return {
      periodStart: period.start,
      periodEnd: period.end,
      invoiceOn: period.invoiceOn,
      volumeUsd,
      tier,
      percent,
      automatic,
      subscription,
      volumeFee,
      credit,
      total: waived ? 0 : Math.max(0, gross - credit),
      waived,
    };
  }, [period, commercial, volumeUsd, feeTiers]);

  const rows = useMemo((): Row[] => {
    if (!bills) return [];
    const out = bills
      .filter((b) => b.status !== "draft")
      .map(billRow)
      .sort((a, b) =>
        ymd(b.bill?.periodStart).localeCompare(ymd(a.bill?.periodStart)),
      );
    if (estimate) {
      out.unshift({
        key: "upcoming",
        year: estimate.periodStart.slice(0, 4),
        month: fmtMonth(estimate.periodStart),
        activation: false,
        periodStart: estimate.periodStart,
        periodEnd: estimate.periodEnd,
        subscription: estimate.subscription,
        volumeFee: estimate.volumeFee,
        volumeUsd: estimate.volumeUsd,
        volumeDetail: `${usd(estimate.volumeUsd)} so far × ${estimate.percent}%${
          estimate.automatic ? ` (${tierLabel(estimate.tier)} band)` : ""
        }`,
        total: estimate.total,
        totalTitle:
          estimate.credit > 0 && !estimate.waived
            ? `${usd(estimate.credit)} credit deducted`
            : null,
        dueOn: estimate.invoiceOn,
        status: estimate.waived ? "waived" : "upcoming",
        statusLabel: estimate.waived ? "Waived" : "Upcoming",
        bill: null,
      });
    }
    return out;
  }, [bills, estimate]);

  const years = useMemo(
    () => [...new Set(rows.map((r) => r.year).filter(Boolean))].sort().reverse(),
    [rows],
  );
  const recentYears = years.slice(0, 3);
  const olderYears = years.slice(3);
  const visibleRows = year === "all" ? rows : rows.filter((r) => r.year === year);

  const openBills = useMemo(
    () =>
      (bills ?? [])
        .filter((b) => OPEN_STATUSES.has(b.status))
        .sort((a, b) => ymd(a.dueAt).localeCompare(ymd(b.dueAt))),
    [bills],
  );
  const dueTotal = openBills.reduce((sum, b) => sum + num(b.totalAmount), 0);
  const hasOverdue = openBills.some((b) => b.status === "overdue");
  const activated = Boolean(commercial?.billingAnchorAt);
  const loading = bills == null;

  const openBill = (bill: ServiceBill) =>
    navigate(merchantRoute(`service-bills/${encodeURIComponent(bill.id)}`));

  const waivedLeft = commercial?.waivedMonthsLeft ?? 0;
  const planTier = estimate?.tier ?? commercial?.tier;
  const planPercent = estimate?.percent ?? commercial?.volumeFeePercent;
  const planMeta = commercial
    ? [
        commercial.rateMode === "fixed" ? "Fixed" : "Automatic",
        planTier ? tierLabel(planTier) : null,
        planPercent ? `${planPercent}% of volume` : null,
        commercial.pendingVolumeFeePercent
          ? `${commercial.pendingVolumeFeePercent}% from next period`
          : null,
        num(commercial.serviceBillCreditUsd) > 0
          ? `${usd(num(commercial.serviceBillCreditUsd))} credit`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : loading
      ? "Loading…"
      : "Plan unavailable";

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
              <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M9 13h6" />
              <path d="M9 17h6" />
              <path d="M9 9h2" />
            </svg>
          </span>
          <div className="plat-bills__intro-copy">
            <h1 className="plat-bills__intro-title">Service Bills</h1>
            <p className="plat-bills__intro-sub">
              Monthly PaymentGate fees — not deducted from payer on-chain.
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
        <div className="plat-bills__kpi" role="group" aria-label="Billing summary">
          <KpiCard
            accent="blue"
            label="Next bill"
            value={
              activated && estimate ? (
                estimate.waived ? (
                  "Waived"
                ) : (
                  <>
                    ~<FundAmount animate amount={estimate.total.toFixed(2)} />
                  </>
                )
              ) : (
                "—"
              )
            }
            meta={
              activated && estimate
                ? `Invoiced ${formatSlashDate(estimate.invoiceOn)}${
                    estimate.waived
                      ? ` · ${waivedLeft} waived month${waivedLeft === 1 ? "" : "s"} left`
                      : " · estimate"
                  }`
                : loading
                  ? "Loading…"
                  : "Monthly billing starts after activation."
            }
          />
          <KpiCard
            accent={hasOverdue ? "danger" : "warn"}
            label="Due now"
            value={loading ? "—" : <FundAmount animate amount={dueTotal.toFixed(2)} />}
            meta={
              openBills.length === 0
                ? "Nothing to pay"
                : `${openBills.length} open bill${openBills.length === 1 ? "" : "s"}${
                    hasOverdue ? " · overdue" : ""
                  }`
            }
            action={
              canPay && openBills[0] ? (
                <button
                  type="button"
                  className="plat-bills__kpi-view"
                  onClick={() => openBill(openBills[0])}
                >
                  <span className="plat-bills__kpi-view-text">Pay</span>
                  <span className="plat-bills__kpi-view-arrow" aria-hidden>
                    →
                  </span>
                </button>
              ) : null
            }
          />
          <KpiCard
            accent="violet"
            label="Your plan"
            value={
              commercial ? (
                <>
                  <FundAmount
                    animate
                    amount={(
                      estimate?.subscription ?? num(commercial.subscriptionAmountUsd)
                    ).toFixed(2)}
                  />
                  <span className="plat-bills__kpi-unit">/month</span>
                </>
              ) : (
                "—"
              )
            }
            meta={planMeta}
          />
        </div>
      </div>

      <div className="plat-bills__panel plat-bills__panel--solo" aria-label="Bills by month">
        <div className="plat-bills__main">
          <div className="plat-bills__table-wrap">
            <div className="plat-bills__table-scroll">
              {loading ? <PagePending /> : null}
              {!loading && visibleRows.length === 0 ? (
                <p className="plat-bills__empty">
                  No service bills yet. Monthly bills appear here after activation and
                  each billing cycle.
                </p>
              ) : null}
              {!loading && visibleRows.length > 0 ? (
                <table className="plat-bills__table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Amount</th>
                      <th>Billed volume</th>
                      <th>Billing period</th>
                      <th>Due date</th>
                      <th>Status</th>
                      <th className="plat-bills__th-actions">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, index) => {
                      const bill = row.bill;
                      const overdue = row.status === "overdue";
                      const payable = Boolean(bill && canPay && OPEN_STATUSES.has(row.status));
                      const estimated = !bill;
                      const reviewHref = volumeReviewHref(row);
                      const tone = estimated
                        ? row.status === "waived"
                          ? "muted"
                          : "teal"
                        : serviceBillStatusTone(row.status);
                      return (
                        <tr
                          key={row.key}
                          className={`plat-bills__row${estimated ? " is-estimate" : ""}`}
                          style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
                          tabIndex={bill ? 0 : undefined}
                          role={bill ? "link" : undefined}
                          onClick={bill ? () => openBill(bill) : undefined}
                          onKeyDown={
                            bill
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openBill(bill);
                                  }
                                }
                              : undefined
                          }
                        >
                          <td className="plat-bills__month">{row.month}</td>
                          <td
                            className="plat-bills__amount-cell"
                            title={row.totalTitle ?? undefined}
                          >
                            <span className="plat-bills__amount plat-bills__amount--total">
                              {estimated && row.status !== "waived" ? "~" : ""}
                              <FundAmount amount={row.total.toFixed(2)} />
                            </span>
                            {row.subscription != null && row.volumeFee != null ? (
                              <span
                                className="plat-bills__fee-parts"
                                title={row.volumeDetail ?? undefined}
                              >
                                <FundAmount amount={row.subscription.toFixed(2)} />
                                {" + "}
                                <FundAmount amount={row.volumeFee.toFixed(2)} />
                              </span>
                            ) : null}
                          </td>
                          <td
                            className="plat-bills__amount plat-bills__amount--base"
                            title={row.volumeDetail ?? undefined}
                          >
                            {row.volumeUsd == null ? (
                              "—"
                            ) : (
                              <FundAmount amount={row.volumeUsd.toFixed(2)} />
                            )}
                          </td>
                          <td className="plat-bills__created">
                            <PeriodCell row={row} />
                          </td>
                          <td className={`plat-bills__due${overdue ? " is-overdue" : ""}`}>
                            {estimated ? `Invoiced ${formatSlashDate(row.dueOn)}` : formatSlashDate(row.dueOn)}
                          </td>
                          <td className="plat-bills__status-cell">
                            <span className="plat-bills__status-row">
                              <span
                                className={`plat-bills__badge tone-${tone}${
                                  overdue ? " is-pulse" : ""
                                }`}
                              >
                                {row.statusLabel}
                              </span>
                              {payable ? (
                                <button
                                  type="button"
                                  className="plat-bills__kind-chip is-action"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openBill(bill!);
                                  }}
                                >
                                  Pay
                                </button>
                              ) : null}
                            </span>
                          </td>
                          <td className="plat-bills__td-actions">
                            {reviewHref ? (
                              <Link
                                className="plat-bills__review"
                                to={reviewHref}
                                title="Completed invoices billed in this period"
                                aria-label={`Review invoices for ${row.month}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Review →
                              </Link>
                            ) : null}
                            {bill ? (
                              <button
                                type="button"
                                className="plat-bills__row-more"
                                aria-label="Open bill"
                                title="Open bill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openBill(bill);
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
            {estimate && !estimate.waived && !loading ? (
              <p className="plat-bills__foot-note">
                ~ Upcoming amounts are estimates from settled volume so far this period. The
                final bill is issued on {formatSlashDate(estimate.invoiceOn)}.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

