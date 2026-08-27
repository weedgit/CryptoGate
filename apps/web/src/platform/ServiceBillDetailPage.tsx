import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  getServiceBill,
  getPlatformOrgs,
  type ServiceBill,
  type Session,
} from "./api";
import { ServiceBillActionsPanel } from "./ServiceBillActionsPanel";
import { formatShortDate } from "./org";
import { FundAmount } from "./FundAmount";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { PlatformPending } from "./ui/PlatformPending";

type Props = { session: Session };

type TimelineStep = {
  id: string;
  label: string;
  detail: string;
  tone: "done" | "current" | "muted";
};

function isPastDue(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < Date.now();
}

function buildTimeline(bill: ServiceBill): TimelineStep[] {
  const steps: TimelineStep[] = [
    {
      id: "period",
      label: "Billing period",
      detail: `${formatShortDate(bill.periodStart)} → ${formatShortDate(bill.periodEnd)}`,
      tone: "done",
    },
    {
      id: "issued",
      label: "Issued",
      detail: `Due ${formatShortDate(bill.dueAt)}`,
      tone:
        bill.status === "issued" || bill.status === "overdue"
          ? "current"
          : "done",
    },
  ];

  if (bill.status === "overdue") {
    steps.push({
      id: "overdue",
      label: "Overdue",
      detail: `${formatShortDate(bill.dueAt)} · past due`,
      tone: "current",
    });
    // Issued is complete once overdue is current
    const issued = steps.find((s) => s.id === "issued");
    if (issued) issued.tone = "done";
  }

  if (bill.paidAt) {
    steps.push({
      id: "paid",
      label: "Paid",
      detail: formatShortDate(bill.paidAt),
      tone: "done",
    });
    for (const s of steps) {
      if (s.id !== "paid") s.tone = "done";
    }
  }

  if (bill.voidedAt) {
    steps.push({
      id: "voided",
      label: "Voided",
      detail: formatShortDate(bill.voidedAt),
      tone: "current",
    });
    for (const s of steps) {
      if (s.id !== "voided") s.tone = "done";
    }
  }

  if (bill.lastAdjustmentReason) {
    steps.push({
      id: "adjust",
      label: "Adjusted",
      detail: bill.lastAdjustmentReason,
      tone: bill.status === "paid" || bill.status === "voided" ? "done" : "muted",
    });
  }

  return steps;
}

/** B10 — Service bill detail (Figma `b10-service-bill-detail`). */
export function ServiceBillDetailPage({ session }: Props) {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<ServiceBill | null>(null);
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [row, orgs] = await Promise.all([
        getServiceBill(id),
        getPlatformOrgs(),
      ]);
      setBill(row);
      setMerchantName(orgs.find((o) => o.id === row.orgId)?.name ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load bill");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = useMemo(
    () => (bill ? formatBillId(bill.id) : "Service bill"),
    [bill],
  );

  const timeline = useMemo(
    () => (bill ? buildTimeline(bill) : []),
    [bill],
  );

  const duePast = bill ? isPastDue(bill.dueAt) && bill.status !== "paid" && bill.status !== "voided" : false;

  if (loading) {
    return (
      <PlatformPending
        title="Loading service bill"
        copy="Fetching bill details and merchant name."
      />
    );
  }

  if (error || !bill) {
    return (
      <div className="plat-bill-detail">
        <p className="error">{error ?? "Bill not found"}</p>
        <Link className="plat-bill-detail__back" to="/platform/service-bills">
          ← Back to bills
        </Link>
      </div>
    );
  }

  const lineItems = [
    { label: "Subscription", amount: bill.subscriptionAmount },
    { label: "Volume fee", amount: bill.volumeFeeAmount },
  ];

  return (
    <div className="plat-bill-detail">
      <header className="plat-bill-detail__head">
        <div className="plat-bill-detail__identity">
          <h1 className="plat-bill-detail__id">{title}</h1>
          <span
            className={`plat-bills__badge tone-${serviceBillStatusTone(bill.status)}${
              bill.status === "overdue" ? " is-pulse" : ""
            }`}
          >
            {serviceBillStatusLabel(bill.status)}
          </span>
          <span className="plat-bill-detail__merchant">
            Merchant: {merchantName ?? bill.orgId}
          </span>
        </div>
        <Link className="plat-bill-detail__back-btn" to="/platform/service-bills">
          ← Back to bills
        </Link>
      </header>

      <div className="plat-bill-detail__split">
        <div className="plat-bill-detail__main">
          <section className="plat-bill-detail__card plat-bill-detail__summary">
            <div className="plat-bill-detail__stat">
              <p className="plat-bill-detail__stat-label">Total amount</p>
              <p className="plat-bill-detail__stat-value plat-bill-detail__stat-value--lg">
                <FundAmount amount={bill.totalAmount} />
              </p>
            </div>
            <div className="plat-bill-detail__stat">
              <p className="plat-bill-detail__stat-label">Due date</p>
              <p
                className={`plat-bill-detail__stat-value${
                  duePast ? " is-overdue" : ""
                }`}
              >
                {formatShortDate(bill.dueAt)}
                {duePast ? " (past)" : ""}
              </p>
            </div>
            <div className="plat-bill-detail__stat">
              <p className="plat-bill-detail__stat-label">Billing period</p>
              <p className="plat-bill-detail__stat-value">
                {formatShortDate(bill.periodStart)} →{" "}
                {formatShortDate(bill.periodEnd)}
              </p>
            </div>
            <div className="plat-bill-detail__stat">
              <p className="plat-bill-detail__stat-label">Merchant</p>
              <p className="plat-bill-detail__stat-value">
                {merchantName ?? bill.orgId}
              </p>
            </div>
          </section>

          <section className="plat-bill-detail__card">
            <h2 className="plat-bill-detail__section-title">Line items</h2>
            <table className="plat-bill-detail__lines">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="plat-bill-detail__line-amt">
                      <FundAmount amount={row.amount} />
                    </td>
                  </tr>
                ))}
                {bill.lastAdjustmentReason ? (
                  <tr>
                    <td>
                      Adjustment
                      <span className="plat-bill-detail__line-note">
                        {bill.lastAdjustmentReason}
                      </span>
                    </td>
                    <td className="plat-bill-detail__line-amt muted">—</td>
                  </tr>
                ) : null}
                <tr className="plat-bill-detail__lines-total">
                  <td>Total</td>
                  <td className="plat-bill-detail__line-amt">
                    <FundAmount amount={bill.totalAmount} />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="plat-bill-detail__card">
            <h2 className="plat-bill-detail__section-title">Payment history</h2>
            {bill.paidAt ? (
              <div className="plat-bill-detail__pay-row">
                <div>
                  <p className="plat-bill-detail__pay-title">Marked paid</p>
                  <p className="plat-bill-detail__pay-meta">
                    {formatShortDate(bill.paidAt)}
                  </p>
                </div>
                <p className="plat-bill-detail__pay-amt">
                  <FundAmount amount={bill.totalAmount} />
                </p>
              </div>
            ) : (
              <div className="plat-bill-detail__empty">
                No payments received
              </div>
            )}
          </section>

          <p className="plat-bill-detail__footnote">
            Merchants pay via service-bill checkout — not the guest payment page.
          </p>
        </div>

        <aside className="plat-bill-detail__side">
          <section className="plat-bill-detail__card plat-bill-detail__timeline-card">
            <h2 className="plat-bill-detail__section-title">Bill state timeline</h2>
            <ol className="plat-bill-detail__timeline">
              {timeline.map((step, i) => (
                <li
                  key={step.id}
                  className={`plat-bill-detail__step is-${step.tone}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="plat-bill-detail__step-dot" aria-hidden />
                  <div className="plat-bill-detail__step-body">
                    <p className="plat-bill-detail__step-label">{step.label}</p>
                    <p className="plat-bill-detail__step-detail">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <ServiceBillActionsPanel
            session={session}
            bill={bill}
            onUpdated={(updated) => setBill(updated)}
          />
        </aside>
      </div>

      <p className="mono plat-bill-detail__raw-id" title={bill.id}>
        Full ID · {bill.id}
      </p>
    </div>
  );
}
