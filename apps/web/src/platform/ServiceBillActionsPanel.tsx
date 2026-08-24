import { FormEvent, useMemo, useState } from "react";
import { ApiError, updateServiceBill, type ServiceBill, type Session } from "./api";
import { sessionCanIssueServiceBill } from "./org";

type Props = {
  session: Session;
  bill: ServiceBill;
  onUpdated: (bill: ServiceBill) => void;
};

export function ServiceBillActionsPanel({ session, bill, onUpdated }: Props) {
  const canAct = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");

  const canMarkPaid = bill.status === "issued" || bill.status === "overdue";
  const canVoid = bill.status === "issued";
  const canAdjust = bill.status === "issued" || bill.status === "overdue";

  if (!canAct) return null;

  async function run(action: string, fn: () => Promise<ServiceBill>) {
    setBusy(action);
    setError(null);
    try {
      onUpdated(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function onMarkPaid(e: FormEvent) {
    e.preventDefault();
    await run("mark_paid", () =>
      updateServiceBill(bill.id, {
        action: "mark_paid",
        paymentReference: paymentReference.trim() || undefined,
      }),
    );
  }

  async function onVoid(e: FormEvent) {
    e.preventDefault();
    await run("void", () =>
      updateServiceBill(bill.id, {
        action: "void",
        reason: voidReason.trim(),
      }),
    );
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    await run("adjust", () =>
      updateServiceBill(bill.id, {
        action: "adjust",
        reason: adjustReason.trim(),
        adjustmentAmount: adjustmentAmount.trim(),
      }),
    );
  }

  if (!canMarkPaid && !canVoid && !canAdjust) {
    return (
      <p style={{ color: "var(--muted)", marginTop: 24 }}>
        No platform actions available for status &ldquo;{bill.status}&rdquo;.
      </p>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 24, padding: 24 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Platform actions</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
        Off-chain mark paid / void / adjust — separate from merchant payment orders.
      </p>
      {error ? <p className="error">{error}</p> : null}

      {canMarkPaid ? (
        <form className="form-stack bill-action-form" onSubmit={onMarkPaid}>
          <p className="field-label">Mark paid</p>
          <div className="field">
            <label htmlFor="pay-ref">Payment reference (optional)</label>
            <input
              id="pay-ref"
              className="field-control"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Bank ref or tx note"
              disabled={busy !== null}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={busy !== null}>
            {busy === "mark_paid" ? "Saving…" : "Mark paid"}
          </button>
        </form>
      ) : null}

      {canVoid ? (
        <form className="form-stack bill-action-form" onSubmit={onVoid}>
          <p className="field-label">Void (issued only)</p>
          <div className="field">
            <label htmlFor="void-reason">Reason</label>
            <input
              id="void-reason"
              className="field-control"
              required
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              disabled={busy !== null}
            />
          </div>
          <button type="submit" className="btn-secondary" disabled={busy !== null}>
            {busy === "void" ? "Voiding…" : "Void bill"}
          </button>
        </form>
      ) : null}

      {canAdjust ? (
        <form className="form-stack bill-action-form" onSubmit={onAdjust}>
          <p className="field-label">Adjust total</p>
          <div className="field-row">
            <div className="field">
              <label htmlFor="adj-amt">Adjustment (USD, signed)</label>
              <input
                id="adj-amt"
                className="field-control"
                required
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                placeholder="-10.00"
                disabled={busy !== null}
              />
            </div>
            <div className="field">
              <label htmlFor="adj-reason">Reason</label>
              <input
                id="adj-reason"
                className="field-control"
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                disabled={busy !== null}
              />
            </div>
          </div>
          <button type="submit" className="btn-secondary" disabled={busy !== null}>
            {busy === "adjust" ? "Adjusting…" : "Apply adjustment"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
