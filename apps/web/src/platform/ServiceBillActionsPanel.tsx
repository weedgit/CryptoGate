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
  send:
    "Release this draft to the merchant. Sets pay-by from Pay within (days) on the billing calendar.",
  cancel:
    "Cancel an unpaid draft, issued, or overdue bill. Keeps the row for audit. Clears billing pause if this bill caused it.",
  markPaid:
    "Record that the merchant already remitted this service bill (TRON USDT to the billing wallet).",
  voidBill:
    "Void this unpaid bill. Requires a reason. Kept for audit.",
  adjustLines:
    "Set subscription and/or volume fee lines; total recomputes. Use for waivers and corrections.",
  adjustTotal:
    "Change total by a signed USD delta (e.g. -10.00) without editing lines.",
  grantCredit:
    "After a paid bill, grant USD credit applied on the next generated service bill.",
  opsNote: "Optional ops note stored on the bill for special-case audit.",
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
  const [lineSub, setLineSub] = useState(bill.subscriptionAmount);
  const [lineVol, setLineVol] = useState(bill.volumeFeeAmount);
  const [opsNote, setOpsNote] = useState(bill.opsNote ?? "");
  const [cancelReason, setCancelReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  const canSend = bill.status === "draft";
  const canCancel =
    bill.status === "draft" ||
    bill.status === "issued" ||
    bill.status === "overdue";
  const canMarkPaid = bill.status === "issued" || bill.status === "overdue";
  const canVoid = bill.status === "issued" || bill.status === "draft";
  const canAdjust =
    bill.status === "issued" ||
    bill.status === "overdue" ||
    bill.status === "draft";
  const canGrantCredit = bill.status === "paid";

  useEffect(() => {
    setLineSub(bill.subscriptionAmount);
    setLineVol(bill.volumeFeeAmount);
    setOpsNote(bill.opsNote ?? "");
  }, [bill.id, bill.subscriptionAmount, bill.volumeFeeAmount, bill.opsNote]);

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

  async function onSend(e: FormEvent) {
    e.preventDefault();
    await run("send", () =>
      updateServiceBill(bill.id, {
        action: "send",
        opsNote: opsNote.trim() || undefined,
      }),
    );
  }

  async function onCancel(e: FormEvent) {
    e.preventDefault();
    await run("cancel", () =>
      updateServiceBill(bill.id, {
        action: "cancel",
        reason: cancelReason.trim() || undefined,
        opsNote: opsNote.trim() || undefined,
      }),
    );
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

  async function onAdjustLines(e: FormEvent) {
    e.preventDefault();
    await run("adjust_lines", () =>
      updateServiceBill(bill.id, {
        action: "adjust",
        reason: adjustReason.trim(),
        subscriptionAmount: lineSub.trim(),
        volumeFeeAmount: lineVol.trim(),
        opsNote: opsNote.trim() || undefined,
      }),
    );
  }

  async function onAdjustTotal(e: FormEvent) {
    e.preventDefault();
    await run("adjust", () =>
      updateServiceBill(bill.id, {
        action: "adjust",
        reason: adjustReason.trim(),
        adjustmentAmount: adjustmentAmount.trim(),
        opsNote: opsNote.trim() || undefined,
      }),
    );
  }

  async function onGrantCredit(e: FormEvent) {
    e.preventDefault();
    await run("grant_credit", () =>
      updateServiceBill(bill.id, {
        action: "grant_credit",
        creditAmount: creditAmount.trim(),
        reason: creditReason.trim(),
        opsNote: opsNote.trim() || undefined,
      }),
    );
  }

  if (
    !canSend &&
    !canCancel &&
    !canMarkPaid &&
    !canVoid &&
    !canAdjust &&
    !canGrantCredit
  ) {
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

      {(canSend || canCancel || canAdjust || canGrantCredit) && (
        <div className="b4-field">
          <label className="b4-field__label" htmlFor="ops-note">
            Ops note <ActionHelpTip text={ACTION_HELP.opsNote} />
          </label>
          <input
            id="ops-note"
            className="b4-field__control"
            value={opsNote}
            onChange={(e) => setOpsNote(e.target.value)}
            placeholder="Waiver / special-case note"
            disabled={busy !== null}
          />
        </div>
      )}

      {bill.opsNote ? (
        <p className="muted" style={{ fontSize: "0.88rem" }}>
          Current note: {bill.opsNote}
          {bill.creditAppliedUsd && bill.creditAppliedUsd !== "0.00"
            ? ` · Credit applied ${bill.creditAppliedUsd}`
            : ""}
        </p>
      ) : null}

      {canSend ? (
        <form className="plat-bill-actions__block" onSubmit={onSend}>
          <div className="plat-bill-actions__block-head">
            <p className="plat-bill-actions__block-title">Send invoice</p>
            <ActionHelpTip text={ACTION_HELP.send} />
          </div>
          <button type="submit" className="btn btn--primary" disabled={busy !== null}>
            {busy === "send" ? "Sending…" : "Confirm & send"}
          </button>
        </form>
      ) : null}

      {canCancel ? (
        <form className="plat-bill-actions__block" onSubmit={onCancel}>
          <div className="plat-bill-actions__block-head">
            <p className="plat-bill-actions__block-title">Cancel invoice</p>
            <ActionHelpTip text={ACTION_HELP.cancel} />
          </div>
          <div className="b4-field">
            <label className="b4-field__label" htmlFor="cancel-reason">
              Reason (optional)
            </label>
            <input
              id="cancel-reason"
              className="b4-field__control"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--danger" disabled={busy !== null}>
            {busy === "cancel" ? "Cancelling…" : "Cancel invoice"}
          </button>
        </form>
      ) : null}

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
              placeholder="On-chain tx hash"
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
              disabled={busy !== null}
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
              placeholder="Merchant sender (optional)"
              disabled={busy !== null}
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
        <>
          <form className="plat-bill-actions__block" onSubmit={onAdjustLines}>
            <div className="plat-bill-actions__block-head">
              <p className="plat-bill-actions__block-title">Adjust lines</p>
              <ActionHelpTip text={ACTION_HELP.adjustLines} />
            </div>
            <div className="plat-bill-actions__row">
              <div className="b4-field">
                <label className="b4-field__label" htmlFor="line-sub">
                  Subscription (USD)
                </label>
                <input
                  id="line-sub"
                  className="b4-field__control"
                  required
                  value={lineSub}
                  onChange={(e) => setLineSub(e.target.value)}
                  disabled={busy !== null}
                />
              </div>
              <div className="b4-field">
                <label className="b4-field__label" htmlFor="line-vol">
                  Volume fee (USD)
                </label>
                <input
                  id="line-vol"
                  className="b4-field__control"
                  required
                  value={lineVol}
                  onChange={(e) => setLineVol(e.target.value)}
                  disabled={busy !== null}
                />
              </div>
            </div>
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="adj-reason-lines">
                Reason
              </label>
              <input
                id="adj-reason-lines"
                className="b4-field__control"
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                disabled={busy !== null}
              />
            </div>
            <button
              type="submit"
              className="plat-bill-actions__ghost"
              disabled={busy !== null}
            >
              {busy === "adjust_lines" ? "Saving…" : "Save line amounts"}
            </button>
          </form>

          <form className="plat-bill-actions__block" onSubmit={onAdjustTotal}>
            <div className="plat-bill-actions__block-head">
              <p className="plat-bill-actions__block-title">Adjust total (delta)</p>
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
              {busy === "adjust" ? "Adjusting…" : "Apply delta"}
            </button>
          </form>
        </>
      ) : null}

      {canGrantCredit ? (
        <form className="plat-bill-actions__block" onSubmit={onGrantCredit}>
          <div className="plat-bill-actions__block-head">
            <p className="plat-bill-actions__block-title">Grant next-period credit</p>
            <ActionHelpTip text={ACTION_HELP.grantCredit} />
          </div>
          <div className="plat-bill-actions__row">
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="credit-amt">
                Credit (USD)
              </label>
              <input
                id="credit-amt"
                className="b4-field__control"
                required
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="25.00"
                disabled={busy !== null}
              />
            </div>
            <div className="b4-field">
              <label className="b4-field__label" htmlFor="credit-reason">
                Reason
              </label>
              <input
                id="credit-reason"
                className="b4-field__control"
                required
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                disabled={busy !== null}
              />
            </div>
          </div>
          <button
            type="submit"
            className="plat-bill-actions__ghost"
            disabled={busy !== null}
          >
            {busy === "grant_credit" ? "Saving…" : "Grant credit"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
