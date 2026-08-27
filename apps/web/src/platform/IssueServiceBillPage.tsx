import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, getPlatformOrgs, invalidatePlatformServiceBillsList, issueServiceBill } from "./api";
import { PlatformPending } from "./ui/PlatformPending";

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

export function IssueServiceBillPage() {
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
  }, []);

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
      navigate(`/platform/service-bills/${bill.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue bill");
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <PlatformPending
        title="Loading merchants"
        copy="Preparing the bill form and merchant list."
      />
    );
  }

  return (
    <div className="panel">
      <h2>Issue service bill</h2>
      <p style={{ color: "var(--muted)" }}>
        Platform billing rail — separate from merchant payment orders.
      </p>
      <form className="form-stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="bill-org">Merchant org</label>
          <select
            id="bill-org"
            className="field-control"
            required
            value={orgId}
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
        <div className="field-row">
          <div className="field">
            <label htmlFor="period-start">Period start</label>
            <input
              id="period-start"
              className="field-control"
              type="date"
              required
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
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="sub-amt">Subscription (USD)</label>
            <input
              id="sub-amt"
              className="field-control"
              required
              value={subscriptionAmount}
              onChange={(e) => setSubscriptionAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="vol-amt">Volume fee (USD)</label>
            <input
              id="vol-amt"
              className="field-control"
              required
              value={volumeFeeAmount}
              onChange={(e) => setVolumeFeeAmount(e.target.value)}
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
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="action-row">
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "Issuing…" : "Issue bill"}
          </button>
          <Link className="btn-secondary" to="/platform/service-bills">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
