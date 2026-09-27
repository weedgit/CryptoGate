import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { OnboardWizardBrandHead } from "../shared/onboardMerchantUi";
import {
  ApiError,
  getBillingCalendarSettings,
  getPlatformOrgs,
  issueServiceBill,
} from "./api";
import { invalidateServiceBillsServer } from "../shared/serviceBillsServer";
import { platformRoute } from "../shared/portalRouting";

/** Sum of two USD inputs in cents; null while either is not a valid amount. */
function addUsdStrings(a: string, b: string): string | null {
  const re = /^\d+(\.\d{1,2})?$/;
  if (!re.test(a.trim()) || !re.test(b.trim())) return null;
  const cents = Math.round(Number(a) * 100) + Math.round(Number(b) * 100);
  return (cents / 100).toFixed(2);
}

function monthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function ChargeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v18M7 8.5h7.5a2.5 2.5 0 0 1 0 5H9.5a2.5 2.5 0 0 0 0 5H17"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  onIssued?: () => void;
};

/** Service Bills → More → Charge: one-off bill for a custom period and amount. */
export function IssueServiceBillModal({ open, onClose, onIssued }: Props) {
  const navigate = useNavigate();
  const bounds = useMemo(() => monthBounds(), []);
  const [merchants, setMerchants] = useState<{ id: string; name: string }[]>([]);
  const [orgId, setOrgId] = useState("");
  const [periodStart, setPeriodStart] = useState(bounds.start);
  const [periodEnd, setPeriodEnd] = useState(bounds.end);
  const [subscriptionAmount, setSubscriptionAmount] = useState("99.00");
  const [volumeFeeAmount, setVolumeFeeAmount] = useState("0.00");
  const [payWithinDays, setPayWithinDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOrgId("");
    setPeriodStart(bounds.start);
    setPeriodEnd(bounds.end);
    setSubscriptionAmount("99.00");
    setVolumeFeeAmount("0.00");
    setPayWithinDays(null);
    setError(null);
    setLoading(false);
    setBooting(true);
    Promise.all([
      getPlatformOrgs(),
      getBillingCalendarSettings().catch(() => null),
    ])
      .then(([orgs, calendar]) => {
        setMerchants(
          orgs
            .filter((o) => o.type === "merchant")
            .map((o) => ({ id: o.id, name: o.name })),
        );
        if (calendar?.activationPayDays) {
          setPayWithinDays(calendar.activationPayDays);
        }
      })
      .catch(() => setMerchants([]))
      .finally(() => setBooting(false));
  }, [open, bounds.start, bounds.end]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const bill = await issueServiceBill({
        orgId,
        periodStart,
        periodEnd,
        subscriptionAmount,
        volumeFeeAmount,
      });
      invalidateServiceBillsServer();
      onIssued?.();
      onClose();
      navigate(platformRoute(`service-bills/${bill.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue bill");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const total = addUsdStrings(subscriptionAmount, volumeFeeAmount);
  const dueLabel =
    payWithinDays != null
      ? `${payWithinDays} day${payWithinDays === 1 ? "" : "s"} after issue`
      : "Pay within (Fees → Billing calendar)";

  return createPortal(
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div
        className="b4-wizard-portal"
        role="presentation"
        onClick={() => {
          if (!loading) onClose();
        }}
      >
        <div
          className="plat-issue-pop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-bill-title"
          onClick={(e) => e.stopPropagation()}
        >
          <OnboardWizardBrandHead
            titleId="issue-bill-title"
            title="One-off service bill"
            subtitle="Charge a merchant for a custom period and amount."
            onClose={onClose}
            closeDisabled={loading}
            icon={<ChargeIcon />}
          />

          {booting ? (
            <div className="plat-issue-pop__pending" aria-busy="true">
              <span className="cg-spinner cg-spinner--sm" aria-hidden />
              <p>Loading merchants…</p>
            </div>
          ) : (
            <form className="plat-issue-pop__form" onSubmit={onSubmit}>
              <div className="plat-issue-pop__body">
                <section className="plat-issue-pop__card">
                  <h4 className="plat-issue-pop__card-title">Merchant</h4>
                  <label className="plat-missed-modal__field">
                    <span>Merchant organization</span>
                    <select
                      className="field-control"
                      required
                      autoFocus
                      value={orgId}
                      disabled={loading}
                      onChange={(e) => setOrgId(e.target.value)}
                    >
                      <option value="">Select merchant…</option>
                      {merchants.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="plat-issue-pop__card">
                  <h4 className="plat-issue-pop__card-title">Billing period</h4>
                  <div className="plat-issue-pop__range">
                    <label className="plat-missed-modal__field">
                      <span>Period start</span>
                      <input
                        className="field-control"
                        type="date"
                        required
                        disabled={loading}
                        value={periodStart}
                        max={periodEnd || undefined}
                        onChange={(e) => setPeriodStart(e.target.value)}
                      />
                    </label>
                    <span className="plat-missed-modal__range-sep" aria-hidden>
                      →
                    </span>
                    <label className="plat-missed-modal__field">
                      <span>Period end</span>
                      <input
                        className="field-control"
                        type="date"
                        required
                        disabled={loading}
                        value={periodEnd}
                        min={periodStart || undefined}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                      />
                    </label>
                  </div>
                </section>

                <section className="plat-issue-pop__card">
                  <h4 className="plat-issue-pop__card-title">Amounts (USD)</h4>
                  <div className="plat-issue-pop__grid">
                    <label className="plat-missed-modal__field">
                      <span>Subscription</span>
                      <span className="plat-issue-pop__money">
                        <span aria-hidden>$</span>
                        <input
                          className="field-control"
                          inputMode="decimal"
                          required
                          disabled={loading}
                          value={subscriptionAmount}
                          onChange={(e) => setSubscriptionAmount(e.target.value)}
                        />
                      </span>
                    </label>
                    <label className="plat-missed-modal__field">
                      <span>Volume fee</span>
                      <span className="plat-issue-pop__money">
                        <span aria-hidden>$</span>
                        <input
                          className="field-control"
                          inputMode="decimal"
                          required
                          disabled={loading}
                          value={volumeFeeAmount}
                          onChange={(e) => setVolumeFeeAmount(e.target.value)}
                        />
                      </span>
                    </label>
                  </div>
                </section>

                <div className="plat-issue-pop__summary" role="status">
                  <span>
                    <span className="plat-issue-pop__summary-label">Total</span>
                    <strong>{total != null ? `$${total}` : "—"}</strong>
                  </span>
                  <span>
                    <span className="plat-issue-pop__summary-label">Due</span>
                    {dueLabel}
                  </span>
                </div>
              </div>

              <footer className="b4-wizard__foot">
                <button
                  type="button"
                  className="b4-wizard__cancel"
                  disabled={loading}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="b4-wizard__continue b4-wizard__continue--gold"
                  disabled={loading || !orgId}
                >
                  {loading ? (
                    <>
                      <span className="cg-spinner cg-spinner--xs" aria-hidden />
                      Issuing…
                    </>
                  ) : (
                    "Issue bill"
                  )}
                </button>
              </footer>
            </form>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
