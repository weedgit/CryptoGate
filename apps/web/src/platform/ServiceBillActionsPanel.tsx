import { FormEvent, useMemo, useState } from "react";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  invalidatePlatformServiceBillsList,
  updateServiceBill,
  type ServiceBill,
  type Session,
} from "./api";
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
      const next = await fn();
      invalidatePlatformServiceBillsList();
      onUpdated(next);
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
      <section className="plat-bill-detail__card plat-bill-actions">
        <h2 className="plat-bill-detail__section-title">Platform actions</h2>
        <p className="plat-bill-actions__none">
          No actions available for status &ldquo;{bill.status}&rdquo;.
        </p>
      </section>
    );
  }

  return (
    <section className="plat-bill-detail__card plat-bill-actions">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <h2 className="plat-bill-detail__section-title">Platform actions</h2>
      <p className="plat-bill-actions__lead">
        Off-chain mark paid, void, or adjust — separate from merchant payment
        orders.
      </p>

      {canMarkPaid ? (
        <form className="plat-bill-actions__block" onSubmit={onMarkPaid}>
          <p className="plat-bill-actions__block-title">Mark paid</p>
          <div className="b4-field">
            <label className="b4-field__label" htmlFor="pay-ref">
              Payment reference (optional)
            </label>
            <input
              id="pay-ref"
              className="b4-field__control"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Bank ref or tx note"
              disabled={busy !== null}
            />
          </div>
          <button
            type="submit"
            className="plat-bill-actions__primary"
            disabled={busy !== null}
          >
            {busy === "mark_paid" ? "Saving…" : "Mark paid"}
          </button>
        </form>
      ) : null}

      {canVoid ? (
        <form className="plat-bill-actions__block" onSubmit={onVoid}>
          <p className="plat-bill-actions__block-title">Void bill</p>
          <div className="b4-field">
            <label className="b4-field__label" htmlFor="void-reason">
              Reason
            </label>
            <input
              id="void-reason"
              className="b4-field__control"
              required
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              disabled={busy !== null}
              placeholder="Required"
            />
          </div>
          <button
            type="submit"
            className="plat-bill-actions__ghost"
            disabled={busy !== null}
          >
            {busy === "void" ? "Voiding…" : "Void bill"}
          </button>
        </form>
      ) : null}

      {canAdjust ? (
        <form className="plat-bill-actions__block" onSubmit={onAdjust}>
          <p className="plat-bill-actions__block-title">Adjust total</p>
          <div className="plat-bill-actions__row">
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="adj-amt">
                Adjustment (USD)
              </label>
              <input
                id="adj-amt"
                className="b4-field__control"
                required
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                placeholder="-10.00"
                disabled={busy !== null}
              />
            </div>
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="adj-reason">
                Reason
              </label>
              <input
                id="adj-reason"
                className="b4-field__control"
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                disabled={busy !== null}
              />
            </div>
          </div>
          <button
            type="submit"
            className="plat-bill-actions__ghost"
            disabled={busy !== null}
          >
            {busy === "adjust" ? "Adjusting…" : "Apply adjustment"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
