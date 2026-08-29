import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  getBillingWalletSettings,
  getServiceBill,
  getPlatformOrgs,
  type OrgAccount,
  type PlatformBillingWalletSettings,
  type ServiceBill,
  type Session,
} from "./api";
import { ServiceBillActionsPanel } from "./ServiceBillActionsPanel";
import { formatShortDate } from "./org";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { PlatformPending } from "./ui/PlatformPending";
import {
  platformBillingPayToFallback,
  platformInvoiceSeller,
  ServiceBillInvoiceFace,
} from "../billing/ServiceBillInvoiceFace";
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

/** B10 — Service bill detail + Phase 1 invoice face. */
export function ServiceBillDetailPage({ session }: Props) {
  const { id } = useParams<{ id: string }>();
  const invoiceRef = useRef<HTMLElement | null>(null);
  const [bill, setBill] = useState<ServiceBill | null>(null);
  const [merchant, setMerchant] = useState<OrgAccount | null>(null);
  const [billing, setBilling] = useState<PlatformBillingWalletSettings | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [row, orgs, wallet] = await Promise.all([
        getServiceBill(id),
        getPlatformOrgs(),
        getBillingWalletSettings().catch(() => null),
      ]);
      setBill(row);
      setMerchant(orgs.find((o) => o.id === row.orgId) ?? null);
      setBilling(wallet);
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

  const duePast = bill
    ? isPastDue(bill.dueAt) && bill.status !== "paid" && bill.status !== "voided"
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
        <Link className="plat-bill-detail__back" to="/platform/service-bills">
          ← Back to bills
        </Link>
      </div>
    );
  }

  const envSeller = platformInvoiceSeller();
  const seller = {
    name: billing?.sellerName?.trim() || envSeller.name,
    email: billing?.sellerEmail ?? envSeller.email,
  };
  const payTo =
    billing?.payTo?.trim() || platformBillingPayToFallback() || null;

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
        <Link className="plat-bill-detail__back-btn" to="/platform/service-bills">
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
              billingEmail: merchant?.billingEmail,
              country: merchant?.country,
              orgId: bill.orgId,
            }}
            seller={seller}
            remittance={
              payTo
                ? {
                    payTo,
                    instructions:
                      "Merchants settle this invoice via service-bill checkout to the platform billing destination.",
                  }
                : null
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
    </div>
  );
}
