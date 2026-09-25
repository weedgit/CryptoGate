import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import {
  getCachedServiceBill,
  peekServiceBill,
  primeServiceBill,
} from "../shared/serviceBillDetailCache";
import {
  ApiError,
  getBillingWalletSettings,
  getPlatformOrgs,
  listOrgUsers,
  type OrgAccount,
  type PlatformBillingWalletSettings,
  type ServiceBill,
  type Session,
} from "./api";
import { ServiceBillActionsPanel } from "./ServiceBillActionsPanel";
import { formatShortDate } from "./org";
import {
  formatBillId,
  isActivationServiceBill,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { PagePending } from "./ui/PlatformPending";
import {
  platformBillingPayToFallback,
  resolveServiceBillInvoiceSeller,
  ServiceBillInvoiceFace,
} from "../billing/ServiceBillInvoiceFace";
import { InvoicePrintButton } from "../billing/InvoicePrintButton";
import { AuthToast } from "../auth/AuthToast";

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

function formatOrgIdLabel(id: string): string {
  const t = id.trim();
  if (!t) return "—";
  if (t.length <= 12) return t.toUpperCase();
  return `${t.slice(0, 8).toUpperCase()}…`;
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
        ? "One-time account activation (excluded from agent commission)"
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
      detail: formatShortDate(bill.cancelledAt),
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
      tone: bill.status === "paid" || bill.status === "voided" || bill.status === "cancelled"
        ? "done"
        : "muted",
    });
  }

  return steps;
}

function showPlatformActions(status: string): boolean {
  return (
    status === "draft" ||
    status === "issued" ||
    status === "overdue" ||
    status === "paid"
  );
}

/** B10 — Service bill detail + Phase 1 invoice face. */
export function ServiceBillDetailPage({ session }: Props) {
  const { id } = useParams<{ id: string }>();
  const invoiceRef = useRef<HTMLElement | null>(null);
  const [bill, setBill] = useState<ServiceBill | null>(() =>
    id ? peekServiceBill(id) : null,
  );
  const [merchant, setMerchant] = useState<OrgAccount | null>(null);
  const [buyerContactEmail, setBuyerContactEmail] = useState<string | null>(null);
  const [buyerPhone, setBuyerPhone] = useState<string | null>(null);
  const [billing, setBilling] = useState<PlatformBillingWalletSettings | null>(
    null,
  );
  const [loading, setLoading] = useState(() => !(id && peekServiceBill(id)));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    if (!peekServiceBill(id)) setLoading(true);
    setError(null);
    try {
      const [row, orgs, wallet] = await Promise.all([
        getCachedServiceBill(id),
        getPlatformOrgs(),
        getBillingWalletSettings().catch(() => null),
      ]);
      const members = await listOrgUsers(row.orgId).catch(() => []);
      primeServiceBill(id, row);
      setBill(row);
      const org = orgs.find((o) => o.id === row.orgId) ?? null;
      setMerchant(org);
      setBilling(wallet);
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

  const timeline = useMemo(
    () => (bill ? buildTimeline(bill) : []),
    [bill],
  );

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
        <Link className="plat-bill-detail__back" to={platformRoute("service-bills")}>
          ← Back to service bills
        </Link>
      </div>
    );
  }

  const seller = resolveServiceBillInvoiceSeller({ bill, billing });
  const payTo =
    bill.rxAddress?.trim() ||
    billing?.payTo?.trim() ||
    bill.remittancePayTo?.trim() ||
    platformBillingPayToFallback() ||
    null;
  const actionsOpen = showPlatformActions(bill.status);

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
            "Merchants settle this invoice via service-bill checkout to the platform billing destination.",
        }
      : null,
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
          to={platformRoute("service-bills")}
        >
          ← Back to service bills
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
            <span>{merchant?.name ?? bill.orgId}</span>
            {merchant?.id || bill.orgId ? (
              <span className="plat-bill-detail__org-id">
                Org ID {formatOrgIdLabel(merchant?.id ?? bill.orgId)}
              </span>
            ) : null}
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

          {actionsOpen ? (
            <ServiceBillActionsPanel
              session={session}
              bill={bill}
              onUpdated={(updated) => setBill(updated)}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
