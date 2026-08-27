import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  getPlatformOrgs,
  invalidatePlatformServiceBillsList,
  issueServiceBill,
} from "./api";

function defaultDueAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  d.setHours(23, 59, 0, 0);
  return d.toISOString().slice(0, 16);
}

function monthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onIssued?: () => void;
};

export function IssueServiceBillModal({ open, onClose, onIssued }: Props) {
  const navigate = useNavigate();
  const bounds = useMemo(() => monthBounds(), []);
  const [merchants, setMerchants] = useState<{ id: string; name: string }[]>([]);
  const [orgId, setOrgId] = useState("");
  const [periodStart, setPeriodStart] = useState(bounds.start);
  const [periodEnd, setPeriodEnd] = useState(bounds.end);
  const [subscriptionAmount, setSubscriptionAmount] = useState("99.00");
  const [volumeFeeAmount, setVolumeFeeAmount] = useState("0.00");
  const [dueAt, setDueAt] = useState(defaultDueAt());
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
    setDueAt(defaultDueAt());
    setError(null);
    setLoading(false);
    setBooting(true);
    getPlatformOrgs()
      .then((orgs) =>
        setMerchants(
          orgs
            .filter((o) => o.type === "merchant")
            .map((o) => ({ id: o.id, name: o.name })),
        ),
      )
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
        dueAt: new Date(dueAt).toISOString(),
      });
      invalidatePlatformServiceBillsList();
      onIssued?.();
      onClose();
      navigate(`/platform/service-bills/${bill.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue bill");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="b3-commission-modal-backdrop plat-issue-bill-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        className="b3-commission-modal plat-issue-bill-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-bill-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head">
          <h3 id="issue-bill-title">Issue service bill</h3>
          <button
            type="button"
            className="b3-commission-modal__close"
            aria-label="Close"
            disabled={loading}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {booting ? (
          <div className="plat-issue-bill-modal__pending">
            <p className="muted">Loading merchants…</p>
          </div>
        ) : (
          <form className="plat-issue-bill__form plat-issue-bill__form--modal" onSubmit={onSubmit}>
            <section className="plat-issue-bill__section">
              <h2 className="plat-issue-bill__section-title">Merchant</h2>
              <div className="field">
                <label htmlFor="bill-org">Merchant organization</label>
                <select
                  id="bill-org"
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
              </div>
            </section>

            <section className="plat-issue-bill__section">
              <h2 className="plat-issue-bill__section-title">Billing period</h2>
              <div className="plat-issue-bill__grid">
                <div className="field">
                  <label htmlFor="period-start">Period start</label>
                  <input
                    id="period-start"
                    className="field-control"
                    type="date"
                    required
                    disabled={loading}
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="period-end">Period end</label>
                  <input
                    id="period-end"
                    className="field-control"
                    type="date"
                    required
                    disabled={loading}
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="due-at">Due at</label>
                <input
                  id="due-at"
                  className="field-control"
                  type="datetime-local"
                  required
                  disabled={loading}
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            </section>

            <section className="plat-issue-bill__section">
              <h2 className="plat-issue-bill__section-title">Amounts (USD)</h2>
              <div className="plat-issue-bill__grid">
                <div className="field">
                  <label htmlFor="sub-amt">Subscription</label>
                  <div className="plat-issue-bill__money">
                    <span className="plat-issue-bill__affix" aria-hidden>
                      $
                    </span>
                    <input
                      id="sub-amt"
                      className="field-control"
                      inputMode="decimal"
                      required
                      disabled={loading}
                      value={subscriptionAmount}
                      onChange={(e) => setSubscriptionAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="vol-amt">Volume fee</label>
                  <div className="plat-issue-bill__money">
                    <span className="plat-issue-bill__affix" aria-hidden>
                      $
                    </span>
                    <input
                      id="vol-amt"
                      className="field-control"
                      inputMode="decimal"
                      required
                      disabled={loading}
                      value={volumeFeeAmount}
                      onChange={(e) => setVolumeFeeAmount(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </section>

            {error ? <p className="error plat-issue-bill__error">{error}</p> : null}

            <div className="plat-issue-bill__actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={loading}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                type="submit"
                disabled={loading || !orgId}
              >
                {loading ? "Issuing…" : "Issue bill"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
