import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import {
  platformBillingPayToFallback,
  resolveServiceBillInvoiceSeller,
  ServiceBillInvoiceFace,
} from "../billing/ServiceBillInvoiceFace";
import { InvoicePrintButton } from "../billing/InvoicePrintButton";
import {
  formatBillId,
  isActivationServiceBill,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "../platform/serviceBillStatus";
import { PagePending } from "../platform/ui/PlatformPending";
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

/** Match commission slip lifecycle arrows: done / flowing / idle. */
function timelineArrowTone(
  step: TimelineStep,
  next: TimelineStep | undefined,
): "is-done" | "is-flowing" | "is-idle" {
  if (!next) return "is-idle";
  if (step.tone === "done" && next.tone === "done") return "is-done";
  if (
    (step.tone === "done" && next.tone === "current") ||
    (step.tone === "current" && next.tone === "muted")
  ) {
    return "is-flowing";
  }
  return "is-idle";
}

function buildTimeline(bill: ServiceBill): TimelineStep[] {
  const activation = isActivationServiceBill(bill);
  const steps: TimelineStep[] = [
    {
      id: "period",
      label: activation ? "Activation fee" : "Billing period",
      detail: activation
        ? "One-time account activation (not commissionable)"
        : `${formatShortDate(bill.periodStart)} → ${formatShortDate(bill.periodEnd)}`,
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

  if (bill.status === "issued") {
    steps.push({
      id: "due",
      label: "Due",
      detail: formatShortDate(bill.dueAt),
      tone: "muted",
    });
  }

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

  if (bill.voidedAt || bill.status === "voided") {
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

  if (bill.status === "cancelled") {
    steps.push({
      id: "cancelled",
      label: "Cancelled",
      detail: "Closed",
      tone: "current",
    });
    for (const s of steps) {
      if (s.id !== "cancelled") s.tone = "done";
    }
  }

  if (bill.lastAdjustmentReason) {
    steps.push({
      id: "adjust",
      label: "Adjusted",
      detail: bill.lastAdjustmentReason,
      tone:
        bill.status === "paid" ||
        bill.status === "voided" ||
        bill.status === "cancelled"
          ? "done"
          : "muted",
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
  const [buyerPhone, setBuyerPhone] = useState<string | null>(null);
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
      const org = orgs.find((o) => o.id === row.orgId) ?? null;
      setMerchant(org);
      const preferred =
        members.find((m) => /owner/i.test(m.role)) ??
        members.find((m) => /admin/i.test(m.role)) ??
        members[0];
      setBuyerContactEmail(
        org?.billingEmail?.trim() || preferred?.email?.trim() || null,
      );
      setBuyerPhone(preferred?.phone?.trim() || null);
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
      bill.status !== "voided" &&
      bill.status !== "cancelled"
    : false;

  if (loading) {
    return <PagePending />;
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
          ← Back
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
  const invoiceProps = {
    bill,
    buyer: {
      name: merchant?.name ?? bill.orgId,
      legalName: merchant?.legalName,
      contactEmail: buyerContactEmail,
      phone: buyerPhone,
      country: merchant?.country,
    },
    seller,
    remittance: payTo
      ? {
          payTo,
          instructions:
            "Merchants settle via service-bill checkout. Agent accounts are read-only on this rail.",
        }
      : {
          instructions:
            "Pay-to appears on merchant checkout. Agent accounts cannot issue or mark bills paid.",
        },
  } as const;

  return (
    <div className="plat-bill-detail">
      <AuthToast
        message={error}
        tone="error"
        onDismiss={() => setError(null)}
      />

      <header className="plat-bill-detail__head no-print">
        <Link
          className="plat-bill-detail__back-link"
          to={agentRoute("service-bills")}
        >
          ← Back
        </Link>
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
        <InvoicePrintButton />
      </header>

      <div className="plat-bill-detail__split plat-bill-detail__split--invoice">
        <div className="plat-bill-detail__main">
          <ServiceBillInvoiceFace
            {...invoiceProps}
            invoiceRef={invoiceRef}
          />
          <p className="plat-bill-detail__footnote no-print">
            Merchants pay via service-bill checkout — not the guest payment page.
            Agent accounts cannot issue, adjust, or mark bills paid.
          </p>
        </div>

        <aside className="plat-bill-detail__side no-print">
          <section className="plat-bill-detail__card plat-bill-detail__timeline-card">
            <h2 className="plat-bill-detail__section-title">
              <span className="plat-bill-detail__section-title-icon" aria-hidden>
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path
                    fill="currentColor"
                    d="M11 6.5h2v11h-2zM12 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4m0 7.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4m0 7.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4"
                  />
                </svg>
              </span>
              Bill state timeline
            </h2>
            <ol className="plat-bill-detail__timeline">
              {timeline.map((step, i, arr) => {
                const next = arr[i + 1];
                const arrowTone = timelineArrowTone(step, next);
                return (
                  <li
                    key={step.id}
                    className={`plat-bill-detail__step is-${step.tone}`}
                    style={
                      {
                        animationDelay: `${i * 90}ms`,
                        ["--step-delay"]: `${i * 90}ms`,
                      } as CSSProperties
                    }
                  >
                    <span className="plat-bill-detail__step-dot" aria-hidden />
                    <div className="plat-bill-detail__step-body">
                      <p className="plat-bill-detail__step-label">
                        {step.label}
                      </p>
                      <p className="plat-bill-detail__step-detail">
                        {step.detail}
                      </p>
                    </div>
                    {next ? (
                      <span
                        className={`plat-bill-detail__step-arrow ${arrowTone}`}
                        aria-hidden
                      >
                        <span className="plat-bill-detail__step-arrow-inner">
                          <span className="plat-bill-detail__step-chevron">
                            &gt;
                          </span>
                          <span className="plat-bill-detail__step-chevron">
                            &gt;
                          </span>
                          <span className="plat-bill-detail__step-chevron">
                            &gt;
                          </span>
                        </span>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
