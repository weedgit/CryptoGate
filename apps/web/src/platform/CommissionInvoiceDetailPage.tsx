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
  getCommissionPayout,
  markCommissionPayoutPaid,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import { formatCommissionPeriodLabel } from "../commercial/commissionStatements";
import { formatViewerDateTime } from "../shared/dateTime";
import { platformRoute } from "../shared/portalRouting";
import {
  ApiError,
  listAgentPayoutAddresses,
  type OrgAccount,
  type Session,
} from "./api";
import { sessionCanIssueServiceBill } from "./org";
import { getPlatformOrgs } from "./platformOrgList";
import { orgDetailHref } from "./platformOrgTree";
import { PagePending } from "./ui/PlatformPending";

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
        ? formatViewerDateTime(slip.paidAt)
        : step.state === "todo"
          ? "Awaiting remittance"
          : "Awaiting agent confirm";
    } else if (step.id === "settled") {
      detail = slip.settledAt
        ? formatViewerDateTime(slip.settledAt)
        : "Awaiting agent confirm";
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

/** Platform commission invoice detail — mark-paid when issued. */
export function CommissionInvoiceDetailPage({ session }: Props) {
  const { id } = useParams<{ id: string }>();
  const invoiceRef = useRef<HTMLElement | null>(null);
  const canPay = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const [slip, setSlip] = useState<CommissionPayoutRecord | null>(null);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [payoutAddrs, setPayoutAddrs] = useState<
    Map<string, { address: string; asset: string; network: string }>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paidNote, setPaidNote] = useState("");
  const [paidTxRef, setPaidTxRef] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [row, orgRows, payoutAddrRows] = await Promise.all([
        getCommissionPayout(id),
        getPlatformOrgs(),
        listAgentPayoutAddresses(),
      ]);
      if (!row) {
        setSlip(null);
        setError("Invoice not found");
        return;
      }
      setSlip(row);
      setPaidNote(row.note?.trim() ?? "");
      setPaidTxRef(row.txRef?.trim() ?? "");
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

  async function onConfirmPay() {
    if (!slip || !canPay || slip.payoutStatus !== "issued") return;
    const note = paidNote.trim();
    if (!note) {
      setError("Add a note to confirm payment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await markCommissionPayoutPaid(slip.id, {
        note,
        txRef: paidTxRef.trim() || null,
      });
      if (updated) {
        setSlip(updated);
        setPaidNote(updated.note?.trim() ?? "");
        setPaidTxRef(updated.txRef?.trim() ?? "");
      } else {
        setError("Invoice not found");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm payment");
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
        <Link className="plat-bill-detail__back" to={platformRoute("commissions")}>
          ← Back
        </Link>
      </div>
    );
  }

  if (!slip) {
    return (
      <div className="plat-bill-detail">
        <p className="muted">Invoice not found.</p>
        <Link className="plat-bill-detail__back" to={platformRoute("commissions")}>
          ← Back
        </Link>
      </div>
    );
  }

  const payable = canPay && slip.payoutStatus === "issued";

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
          to={platformRoute("commissions")}
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
            Payee: {slip.payeeName} ·{" "}
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
            viewerPortal="platform"
            byId={byId}
            orgHref={orgDetailHref}
            invoiceRef={invoiceRef}
            missingAddressHint="No payout address on this agent yet. Set it on the agent detail page before sending funds."
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

          {payable ? (
            <section className="plat-bill-detail__card plat-commission-pay">
              <h2 className="plat-bill-detail__section-title">Confirm &amp; pay</h2>
              <div className="plat-commission-pay__body">
                <label className="plat-commission-pay__field">
                  <span className="plat-commission-pay__label">
                    Tx hash / payment ref
                    <span className="plat-commission-pay__optional">
                      Recommended
                    </span>
                  </span>
                  <input
                    className="plat-commission-pay__input"
                    type="text"
                    value={paidTxRef}
                    onChange={(e) => setPaidTxRef(e.target.value)}
                    maxLength={200}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="On-chain tx hash or remittance reference"
                  />
                </label>
                <label className="plat-commission-pay__field">
                  <span className="plat-commission-pay__label">
                    Note
                    <span className="plat-commission-pay__optional is-required">
                      Required
                    </span>
                  </span>
                  <textarea
                    className="plat-commission-pay__input plat-commission-pay__textarea"
                    value={paidNote}
                    onChange={(e) => setPaidNote(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Ops note — who remitted, treasury ticket, etc."
                  />
                </label>
                <button
                  type="button"
                  className="plat-commission-pay__submit"
                  disabled={busy || !paidNote.trim()}
                  onClick={() => void onConfirmPay()}
                >
                  {busy ? "Saving…" : "Confirm & pay"}
                </button>
                {!dest?.address ? (
                  <p className="plat-commission-pay__hint" role="status">
                    No payout address on file. You can still confirm after
                    sending funds off-platform.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
