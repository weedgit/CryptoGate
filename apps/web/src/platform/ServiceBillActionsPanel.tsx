import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getBillingWalletSettings,
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

const ACTION_HELP = {
  markPaid:
    "Record that the merchant already remitted this service bill off-chain (bank or on-chain to the billing wallet). Does not create or fulfill a merchant payment order.",
  voidBill:
    "Cancel this unpaid bill. Requires a reason. Voided bills stay in history for audit — they cannot be marked paid afterward.",
  adjustTotal:
    "Change the amount due before remittance (credit or debit). Enter a signed USD adjustment and reason. Separate from merchant payment-order amounts.",
} as const;

function ActionHelpTip({ text }: { text: string }) {
  return (
    <span className="plat-card-help plat-bill-actions__help">
      <button type="button" className="plat-card-help__btn" aria-label={text}>
        ?
      </button>
      <span className="plat-card-help__tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

export function ServiceBillActionsPanel({ session, bill, onUpdated }: Props) {
  const canAct = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [rxAddress, setRxAddress] = useState("");
  const [txAddress, setTxAddress] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");

  const canMarkPaid = bill.status === "issued" || bill.status === "overdue";
  const canVoid = bill.status === "issued";
  const canAdjust = bill.status === "issued" || bill.status === "overdue";

  useEffect(() => {
    if (!canAct || !canMarkPaid) return;
    let cancelled = false;
    void getBillingWalletSettings()
      .then((settings) => {
        if (cancelled) return;
        const payTo = settings.payTo?.trim() ?? "";
        if (payTo) setRxAddress((prev) => prev || payTo);
      })
      .catch(() => {
        /* optional prefill */
      });
    return () => {
      cancelled = true;
    };
  }, [canAct, canMarkPaid, bill.id]);

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
        rxAddress: rxAddress.trim() || undefined,
        txAddress: txAddress.trim() || undefined,
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

      {canMarkPaid ? (
        <form className="plat-bill-actions__block" onSubmit={onMarkPaid}>
          <div className="plat-bill-actions__block-head">
            <p className="plat-bill-actions__block-title">Mark paid</p>
            <ActionHelpTip text={ACTION_HELP.markPaid} />
          </div>
          <div className="b4-field">
            <label className="b4-field__label" htmlFor="pay-ref">
              Tx hash / payment reference
            </label>
            <input
              id="pay-ref"
              className="b4-field__control"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="On-chain tx hash or bank ref"
              disabled={busy !== null}
              autoComplete="off"
            />
          </div>
          <div className="b4-field">
            <label className="b4-field__label" htmlFor="rx-addr">
              Rx address
            </label>
            <input
              id="rx-addr"
              className="b4-field__control"
              value={rxAddress}
              onChange={(e) => setRxAddress(e.target.value)}
              placeholder="Platform billing wallet"
              disabled={busy !== null}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="b4-field">
            <label className="b4-field__label" htmlFor="tx-addr">
              Tx address
            </label>
            <input
              id="tx-addr"
              className="b4-field__control"
              value={txAddress}
              onChange={(e) => setTxAddress(e.target.value)}
              placeholder="Merchant payer / sender (optional)"
              disabled={busy !== null}
              autoComplete="off"
              spellCheck={false}
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
          <div className="plat-bill-actions__block-head">
            <p className="plat-bill-actions__block-title">Void bill</p>
            <ActionHelpTip text={ACTION_HELP.voidBill} />
          </div>
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
          <div className="plat-bill-actions__block-head">
            <p className="plat-bill-actions__block-title">Adjust total</p>
            <ActionHelpTip text={ACTION_HELP.adjustTotal} />
          </div>
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
