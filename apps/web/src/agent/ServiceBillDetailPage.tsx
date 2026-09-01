import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import {
  platformBillingPayToFallback,
  resolveServiceBillInvoiceSeller,
  ServiceBillInvoiceFace,
} from "../billing/ServiceBillInvoiceFace";
import { ServiceBillPayQrCard } from "../billing/ServiceBillPayQrCard";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "../platform/serviceBillStatus";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { formatShortTime } from "../merchant/orderStatus";
import {
  getCachedServiceBill,
  peekServiceBill,
  primeServiceBill,
} from "../shared/serviceBillDetailCache";
import {
  ApiError,
  listOrgUsers,
  type OrgAccount,
  type ServiceBill,
} from "./api";
import { getAgentOrgs } from "./agentOrgList";
import { formatShortDate } from "./org";

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

/** Agent service bill detail — shared invoice face, read-only (no mark paid / void). */
export function ServiceBillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoiceRef = useRef<HTMLElement | null>(null);
  const [bill, setBill] = useState<ServiceBill | null>(() =>
    id ? peekServiceBill(id) : null,
  );
  const [merchant, setMerchant] = useState<OrgAccount | null>(null);
  const [buyerContactEmail, setBuyerContactEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !(id && peekServiceBill(id)));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    if (!peekServiceBill(id)) setLoading(true);
    setError(null);
    try {
      const [row, orgs] = await Promise.all([
        getCachedServiceBill(id),
        getAgentOrgs(),
      ]);
      const members = await listOrgUsers(row.orgId).catch(() => []);
      primeServiceBill(id, row);
      setBill(row);
      setMerchant(orgs.find((o) => o.id === row.orgId) ?? null);
      const preferred =
        members.find((m) => /owner/i.test(m.role)) ??
        members.find((m) => /admin/i.test(m.role)) ??
        members[0];
      setBuyerContactEmail(preferred?.email?.trim() || null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load bill");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const seeded = peekServiceBill(id);
    setBill(seeded);
    if (!seeded) setLoading(true);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = useMemo(
    () => (bill ? formatBillId(bill.id) : "Service bill"),
    [bill],
  );

  const timeline = useMemo(() => (bill ? buildTimeline(bill) : []), [bill]);

  const duePast = bill
    ? isPastDue(bill.dueAt) &&
      bill.status !== "paid" &&
      bill.status !== "voided"
    : false;

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
        <AuthToast
          message={error ?? "Bill not found"}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <p className="muted">Could not load this service bill.</p>
        <Link className="plat-bill-detail__back" to={agentRoute("service-bills")}>
          ← Back to bills
        </Link>
      </div>
    );
  }

  const seller = resolveServiceBillInvoiceSeller({ bill });
  const payTo =
    bill.rxAddress?.trim() ||
    bill.remittancePayTo?.trim() ||
    platformBillingPayToFallback() ||
    null;

  return (
    <div className="plat-bill-detail">
      <header className="plat-bill-detail__head">
        <div className="plat-bill-detail__identity">
          <h1 className="plat-bill-detail__id">{title}</h1>
          <span
            className={`plat-bills__badge tone-${serviceBillStatusTone(bill.status)}${
              bill.status === "overdue" || duePast ? " is-pulse" : ""
            }`}
          >
            {serviceBillStatusLabel(bill.status)}
          </span>
          <span className="plat-bill-detail__merchant">
            Merchant: {merchant?.name ?? bill.orgId}
          </span>
        </div>
        <Link className="plat-bill-detail__back-btn" to={agentRoute("service-bills")}>
          ← Back to bills
        </Link>
      </header>

      <div className="plat-bill-detail__split">
        <div className="plat-bill-detail__main">
          <ServiceBillInvoiceFace
            bill={bill}
            buyer={{
              name: merchant?.name ?? bill.orgId,
              legalName: merchant?.legalName,
              contactEmail: buyerContactEmail,
              country: merchant?.country,
              orgId: bill.orgId,
            }}
            seller={seller}
            remittance={
              payTo
                ? {
                    payTo,
                    instructions:
                      "Merchants settle via service-bill checkout. Agent accounts are read-only on this rail.",
                  }
                : {
                    instructions:
                      "Pay-to appears on merchant checkout. Agent accounts cannot issue or mark bills paid.",
                  }
            }
            statusBadge={
              <span
                className={`plat-bills__badge tone-${serviceBillStatusTone(bill.status)}`}
              >
                {serviceBillStatusLabel(bill.status)}
              </span>
            }
            toolbar={
              <button
                type="button"
                className="sb-invoice__print-btn"
                onClick={() => window.print()}
              >
                Print invoice
              </button>
            }
            invoiceRef={invoiceRef}
          />
          <p className="plat-bill-detail__footnote">
            Merchants pay via service-bill checkout — not the guest payment page.
            Agent accounts cannot issue, adjust, or mark bills paid.
          </p>
        </div>

        <aside className="plat-bill-detail__side">
          <div className="plat-bill-detail__pay-card no-print">
            <ServiceBillPayQrCard
              totalAmount={bill.totalAmount}
              payTo={payTo}
              status={bill.status}
              dueAt={bill.dueAt}
              timerLabel={
                bill.status === "paid"
                  ? "Payment completed — QR no longer needed"
                  : bill.status === "voided"
                    ? "Bill voided"
                    : bill.status === "overdue"
                      ? "Overdue — settle remittance promptly"
                      : bill.status === "issued"
                        ? `Due ${formatShortTime(bill.dueAt)}`
                        : serviceBillStatusLabel(bill.status)
              }
              hint="Same remittance QR merchants see on service-bill checkout. Agent is read-only."
            />
          </div>

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

          <section className="plat-bill-detail__card">
            <h2 className="plat-bill-detail__section-title">Actions</h2>
            <p className="muted" style={{ margin: 0 }}>
              Issue, adjust, void, and mark-paid are platform-only. Contact
              platform ops if a bill needs a correction.
            </p>
          </section>
        </aside>
      </div>

      <p className="mono plat-bill-detail__raw-id" title={bill.id}>
        Full ID · {bill.id}
      </p>
    </div>
  );
}
