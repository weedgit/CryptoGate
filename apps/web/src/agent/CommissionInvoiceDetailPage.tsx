import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { InvoicePrintButton } from "../billing/InvoicePrintButton";
import { CommissionInvoiceFace } from "../commercial/CommissionInvoiceFace";
import {
  destForInvoice,
  displayCommissionInvoiceId,
  invoiceStatusLabel,
  invoiceStatusTone,
  slipLifecycleSteps,
} from "../commercial/commissionInvoiceShared";
import {
  agentConfirmCommissionPayout,
  getCommissionPayout,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import { formatCommissionPeriodLabel } from "../commercial/commissionStatements";
import { PagePending } from "../platform/ui/PlatformPending";
import { agentRoute } from "../shared/portalRouting";
import {
  ApiError,
  listAgentPayoutAddresses,
  type OrgAccount,
  type Session,
} from "./api";
import { getAgentOrgs } from "./agentOrgList";
import { primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";

type Props = { session: Session };

type TimelineStep = {
  id: string;
  label: string;
  detail: string;
  tone: "done" | "current" | "muted";
};

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

function buildTimeline(slip: CommissionPayoutRecord): TimelineStep[] {
  return slipLifecycleSteps(slip.payoutStatus).map((step) => {
    let detail = "—";
    if (step.id === "issued") {
      detail = formatCommissionPeriodLabel(slip.periodKey);
    } else if (step.id === "paid") {
      detail = slip.paidAt
        ? new Date(slip.paidAt).toLocaleString()
        : step.state === "todo"
          ? "Awaiting remittance"
          : "Awaiting your confirm";
    } else if (step.id === "settled") {
      detail = slip.settledAt
        ? new Date(slip.settledAt).toLocaleString()
        : "Confirm receipt to settle";
    }
    const tone: TimelineStep["tone"] =
      step.state === "done"
        ? "done"
        : step.state === "current"
          ? "current"
          : "muted";
    return { id: step.id, label: step.label, detail, tone };
  });
}

function agentInvoiceOrgHref(
  type: string,
  id: string,
  parentId: string | null,
): string | null {
  if (type === "merchant") return agentRoute(`merchants/${id}`);
  if (type === "merchant_site") {
    return parentId
      ? `${agentRoute(`merchants/${parentId}`)}?tab=sites`
      : agentRoute(`merchants/${id}`);
  }
  return null;
}

/** Agent commission invoice detail — confirm receipt when paid. */
export function CommissionInvoiceDetailPage({ session }: Props) {
  const { id } = useParams<{ id: string }>();
  const invoiceRef = useRef<HTMLElement | null>(null);
  const agentId = primaryAgentOrgId(session);
  const canManage = useMemo(
    () => sessionCanOnboardMerchant(session),
    [session],
  );
  const [slip, setSlip] = useState<CommissionPayoutRecord | null>(null);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [payoutAddrs, setPayoutAddrs] = useState<
    Map<string, { address: string; asset: string; network: string }>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [row, orgRows, payoutAddrRows] = await Promise.all([
        getCommissionPayout(id),
        getAgentOrgs(),
        listAgentPayoutAddresses(),
      ]);
      if (!row) {
        setSlip(null);
        setError("Invoice not found");
        return;
      }
      setSlip(row);
      setOrgs(orgRows);
      const addrMap = new Map<
        string,
        { address: string; asset: string; network: string }
      >();
      for (const payout of payoutAddrRows) {
        if (!payout.address) continue;
        addrMap.set(payout.orgId, {
          address: payout.address,
          asset: payout.asset,
          network: payout.network,
        });
      }
      setPayoutAddrs(addrMap);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load invoice",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const timeline = useMemo(() => (slip ? buildTimeline(slip) : []), [slip]);
  const dest = slip
    ? destForInvoice(slip, payoutAddrs.get(slip.payeeOrgId) ?? null)
    : null;

  async function onConfirmReceipt() {
    if (!slip || !canManage || slip.payeeOrgId !== agentId) return;
    if (slip.payoutStatus !== "paid") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await agentConfirmCommissionPayout(slip.id);
      if (updated) setSlip(updated);
      else setError("Invoice not found");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to confirm commission",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PagePending />;
  }

  if (error && !slip) {
    return (
      <div className="plat-bill-detail">
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <p className="muted">Could not load this commission invoice.</p>
        <Link className="plat-bill-detail__back" to={agentRoute("commissions")}>
          ← Back
        </Link>
      </div>
    );
  }

  if (!slip) {
    return (
      <div className="plat-bill-detail">
        <p className="muted">Invoice not found.</p>
        <Link className="plat-bill-detail__back" to={agentRoute("commissions")}>
          ← Back
        </Link>
      </div>
    );
  }

  const canConfirm =
    canManage &&
    slip.payeeOrgId === agentId &&
    slip.payoutStatus === "paid";

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
          to={agentRoute("commissions")}
        >
          ← Back
        </Link>
        <div className="plat-bill-detail__identity">
          <h1 className="plat-bill-detail__id">
            {displayCommissionInvoiceId(slip.id)}
          </h1>
          <span
            className={`plat-commissions__status is-${invoiceStatusTone(slip.payoutStatus)}`}
          >
            {invoiceStatusLabel(slip.payoutStatus)}
          </span>
          <span className="plat-bill-detail__merchant">
            {formatCommissionPeriodLabel(slip.periodKey)}
          </span>
        </div>
        <InvoicePrintButton />
      </header>

      <div className="plat-bill-detail__split plat-bill-detail__split--invoice">
        <div className="plat-bill-detail__main">
          <CommissionInvoiceFace
            slip={slip}
            dest={dest}
            viewerPortal="agent"
            byId={byId}
            orgHref={agentInvoiceOrgHref}
            invoiceRef={invoiceRef}
            missingAddressHint="No payout address on this agent yet. Set it under Settings, then reopen this invoice."
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
              Invoice timeline
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

          {canConfirm ? (
            <section className="plat-bill-detail__card">
              <h2 className="plat-bill-detail__section-title">Confirm receipt</h2>
              <p className="muted" style={{ marginBottom: 12 }}>
                Confirm you received the platform remittance to settle this
                invoice.
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void onConfirmReceipt()}
              >
                {busy ? "Confirming…" : "Confirm receipt"}
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
