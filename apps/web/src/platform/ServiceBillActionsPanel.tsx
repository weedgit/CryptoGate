import {
  FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

type PanelId =
  | "note"
  | "send"
  | "markPaid"
  | "adjustLines"
  | "adjustTotal"
  | "cancel"
  | "void"
  | "credit"
  | null;

function IconNote() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 2.5L17.5 8H14zM8 12h8v1.5H8zm0 3.5h8V17H8zm0-7h4V10H8z"
      />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M3.4 20.4 21 12 3.4 3.6 3 10.1l11 1.9L3 14z"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-1.2 14.2-3.9-3.9 1.4-1.4 2.5 2.5 5.3-5.3 1.4 1.4z"
      />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M4 6h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zM4 16h2v2H4zm4 0h12v2H8z"
      />
    </svg>
  );
}

function IconSigma() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M6 5h12v2.2L11.4 12 18 16.8V19H6v-2h8.2L8.4 12 14.2 7H6z"
      />
    </svg>
  );
}

function IconCancel() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m3.5 12.1-1.4 1.4L12 13.4l-2.1 2.1-1.4-1.4L10.6 12 8.5 9.9l1.4-1.4L12 10.6l2.1-2.1 1.4 1.4L13.4 12z"
      />
    </svg>
  );
}

function IconVoid() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M9 3h6l1 2h4v2H4V5h4zm1 6h2v9h-2zm4 0h2v9h-2zM7 9h2v9H7zm8 12H9a2 2 0 0 1-2-2V9h10v10a2 2 0 0 1-2 2"
      />
    </svg>
  );
}

function IconChevronRight({ open }: { open?: boolean }) {
  return (
    <svg
      className={`plat-bill-actions__chevron${open ? " is-open" : ""}`}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
    >
      <path fill="currentColor" d="M9.3 6.3 14.9 12l-5.6 5.7-1.4-1.4 4.2-4.3-4.2-4.3z" />
    </svg>
  );
}

function IconActionsTitle() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2 9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5z"
      />
    </svg>
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <h2 className="plat-bill-detail__section-title">
      <span className="plat-bill-detail__section-title-icon" aria-hidden>
        {icon}
      </span>
      {children}
    </h2>
  );
}

function MenuRow({
  id,
  open,
  onToggle,
  icon,
  label,
  hint,
  children,
  disabled,
  tone,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  label: string;
  hint?: string;
  children?: ReactNode;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={`plat-bill-actions__menu-item${open ? " is-open" : ""}${
        tone === "danger" ? " is-danger" : ""
      }`}
    >
      <button
        type="button"
        className="plat-bill-actions__menu-btn"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={children ? `${id}-panel` : undefined}
        onClick={onToggle}
        disabled={disabled}
        title={hint}
      >
        <span className="plat-bill-actions__menu-icon">{icon}</span>
        <span className="plat-bill-actions__menu-label">{label}</span>
        <IconChevronRight open={open} />
      </button>
      {open && children ? (
        <div
          className="plat-bill-actions__menu-panel"
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-trigger`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** USD amount field with a persistent `$` prefix. */
function FundInput({
  id,
  value,
  onChange,
  disabled,
  required,
  placeholder,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="plat-bill-actions__fund">
      <span className="plat-bill-actions__fund-prefix" aria-hidden>
        $
      </span>
      <input
        id={id}
        className="b4-field__control plat-bill-actions__fund-input"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[$,\s]/g, ""))}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function ServiceBillActionsPanel({ session, bill, onUpdated }: Props) {
  const baseId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const canAct = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
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
  const canNote = canSend || canCancel || canAdjust || canGrantCredit;

  useEffect(() => {
    setLineSub(bill.subscriptionAmount);
    setLineVol(bill.volumeFeeAmount);
    setOpsNote(bill.opsNote ?? "");
    setOpenPanel(null);
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

  useEffect(() => {
    if (!openPanel) return;
    function onDocPointer(e: MouseEvent) {
      const root = rootRef.current;
      if (!root || !(e.target instanceof Node)) return;
      if (!root.contains(e.target)) setOpenPanel(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenPanel(null);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openPanel]);

  if (!canAct) return null;

  async function run(action: string, fn: () => Promise<ServiceBill>) {
    setBusy(action);
    setError(null);
    try {
      const next = await fn();
      invalidatePlatformServiceBillsList();
      onUpdated(next);
      setOpenPanel(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  function toggle(panel: Exclude<PanelId, null>) {
    setOpenPanel((prev) => (prev === panel ? null : panel));
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

  async function onSaveNote(e: FormEvent) {
    e.preventDefault();
    // Note is applied with the next send / adjust / cancel / credit action.
    setOpenPanel(null);
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
        <SectionTitle icon={<IconActionsTitle />}>Invoice actions</SectionTitle>
        <p className="plat-bill-actions__none">
          No actions available for status &ldquo;{bill.status}&rdquo;.
        </p>
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      className="plat-bill-detail__card plat-bill-actions plat-bill-actions--menu"
    >
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <SectionTitle icon={<IconActionsTitle />}>Invoice actions</SectionTitle>

      <div className="plat-bill-actions__menu-list">
        {canNote ? (
          <MenuRow
            id={`${baseId}-note`}
            open={openPanel === "note"}
            onToggle={() => toggle("note")}
            icon={<IconNote />}
            label={
              opsNote.trim() || bill.opsNote?.trim()
                ? String(opsNote.trim() || bill.opsNote)
                : "Add an internal note"
            }
            disabled={busy !== null}
          >
            <form onSubmit={onSaveNote}>
              <div className="b4-field">
                <input
                  id={`${baseId}-ops-note`}
                  className="b4-field__control"
                  value={opsNote}
                  onChange={(e) => setOpsNote(e.target.value)}
                  placeholder="Waiver / special-case note"
                  aria-label="Internal note"
                  disabled={busy !== null}
                  autoFocus
                />
              </div>
              {bill.opsNote ? (
                <p className="plat-bill-actions__hint">
                  Saved note: {bill.opsNote}
                  {bill.creditAppliedUsd && bill.creditAppliedUsd !== "0.00"
                    ? ` · Credit applied ${bill.creditAppliedUsd}`
                    : ""}
                </p>
              ) : null}
              <button
                type="submit"
                className="plat-bill-actions__ghost"
                disabled={busy !== null}
              >
                Done
              </button>
            </form>
          </MenuRow>
        ) : null}

        {canSend ? (
          <form className="plat-bill-actions__primary" onSubmit={onSend}>
            <button
              type="submit"
              className="plat-bill-actions__cta"
              disabled={busy !== null}
              title="Release this draft to the merchant"
            >
              <IconSend />
              <span>{busy === "send" ? "Sending…" : "Confirm & send"}</span>
            </button>
            <p className="plat-bill-actions__hint">
              Sets pay-by from Pay within (days) on the billing calendar.
            </p>
          </form>
        ) : null}

        {canMarkPaid ? (
          <MenuRow
            id={`${baseId}-mark-paid`}
            open={openPanel === "markPaid"}
            onToggle={() => toggle("markPaid")}
            icon={<IconCheck />}
            label="Mark as paid"
            hint="Record remittance received"
            disabled={busy !== null}
          >
            <form onSubmit={onMarkPaid}>
              <div className="b4-field">
                <label className="b4-field__label" htmlFor={`${baseId}-pay-ref`}>
                  Tx hash / payment reference
                </label>
                <input
                  id={`${baseId}-pay-ref`}
                  className="b4-field__control"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="On-chain tx hash"
                  disabled={busy !== null}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="b4-field">
                <label className="b4-field__label" htmlFor={`${baseId}-rx`}>
                  Receive address (Rx)
                </label>
                <input
                  id={`${baseId}-rx`}
                  className="b4-field__control"
                  value={rxAddress}
                  onChange={(e) => setRxAddress(e.target.value)}
                  disabled={busy !== null}
                  spellCheck={false}
                />
              </div>
              <div className="b4-field">
                <label className="b4-field__label" htmlFor={`${baseId}-tx`}>
                  Sender address (Tx)
                </label>
                <input
                  id={`${baseId}-tx`}
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
                className="plat-bill-actions__cta"
                disabled={busy !== null}
              >
                {busy === "mark_paid" ? "Saving…" : "Confirm mark paid"}
              </button>
            </form>
          </MenuRow>
        ) : null}

        {canAdjust ? (
          <>
            <MenuRow
              id={`${baseId}-lines`}
              open={openPanel === "adjustLines"}
              onToggle={() => toggle("adjustLines")}
              icon={<IconList />}
              label="Adjust line items"
              hint="Set subscription and/or volume fee lines"
              disabled={busy !== null}
            >
              <form onSubmit={onAdjustLines}>
                <div className="plat-bill-actions__row">
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor={`${baseId}-sub`}>
                      Subscription
                    </label>
                    <FundInput
                      id={`${baseId}-sub`}
                      required
                      value={lineSub}
                      onChange={setLineSub}
                      disabled={busy !== null}
                    />
                  </div>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor={`${baseId}-vol`}>
                      Volume fee
                    </label>
                    <FundInput
                      id={`${baseId}-vol`}
                      required
                      value={lineVol}
                      onChange={setLineVol}
                      disabled={busy !== null}
                    />
                  </div>
                </div>
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor={`${baseId}-adj-r1`}>
                    Reason
                  </label>
                  <input
                    id={`${baseId}-adj-r1`}
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
            </MenuRow>

            <MenuRow
              id={`${baseId}-total`}
              open={openPanel === "adjustTotal"}
              onToggle={() => toggle("adjustTotal")}
              icon={<IconSigma />}
              label="Adjust total (delta-USD)"
              hint="Change total by a signed USD delta"
              disabled={busy !== null}
            >
              <form onSubmit={onAdjustTotal}>
                <div className="plat-bill-actions__row">
                  <div className="b4-field">
                    <label
                      className="b4-field__label"
                      htmlFor={`${baseId}-delta`}
                    >
                      Adjustment
                    </label>
                    <FundInput
                      id={`${baseId}-delta`}
                      required
                      value={adjustmentAmount}
                      onChange={setAdjustmentAmount}
                      placeholder="-10.00"
                      disabled={busy !== null}
                    />
                  </div>
                  <div className="b4-field">
                    <label
                      className="b4-field__label"
                      htmlFor={`${baseId}-adj-r2`}
                    >
                      Reason
                    </label>
                    <input
                      id={`${baseId}-adj-r2`}
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
            </MenuRow>
          </>
        ) : null}

        {canGrantCredit ? (
          <MenuRow
            id={`${baseId}-credit`}
            open={openPanel === "credit"}
            onToggle={() => toggle("credit")}
            icon={<IconSigma />}
            label="Grant next-period credit"
            disabled={busy !== null}
          >
            <form onSubmit={onGrantCredit}>
              <div className="plat-bill-actions__row">
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor={`${baseId}-cred`}>
                    Credit
                  </label>
                  <FundInput
                    id={`${baseId}-cred`}
                    required
                    value={creditAmount}
                    onChange={setCreditAmount}
                    placeholder="25.00"
                    disabled={busy !== null}
                  />
                </div>
                <div className="b4-field">
                  <label
                    className="b4-field__label"
                    htmlFor={`${baseId}-cred-r`}
                  >
                    Reason
                  </label>
                  <input
                    id={`${baseId}-cred-r`}
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
          </MenuRow>
        ) : null}

        {canCancel || canVoid ? (
          <div className="plat-bill-actions__danger">
            <div className="plat-bill-actions__danger-row">
              {canCancel ? (
                <button
                  type="button"
                  className="plat-bill-actions__danger-btn"
                  disabled={busy !== null}
                  aria-expanded={openPanel === "cancel"}
                  onClick={() => toggle("cancel")}
                >
                  <IconCancel />
                  <span>Cancel bill</span>
                </button>
              ) : (
                <span className="plat-bill-actions__danger-spacer" />
              )}
              {canVoid ? (
                <button
                  type="button"
                  className="plat-bill-actions__danger-btn"
                  disabled={busy !== null}
                  aria-expanded={openPanel === "void"}
                  onClick={() => toggle("void")}
                >
                  <IconVoid />
                  <span>Void bill</span>
                </button>
              ) : (
                <span className="plat-bill-actions__danger-spacer" />
              )}
            </div>

            {canCancel && openPanel === "cancel" ? (
              <form className="plat-bill-actions__danger-panel" onSubmit={onCancel}>
                <div className="b4-field">
                  <label
                    className="b4-field__label"
                    htmlFor={`${baseId}-cancel-r`}
                  >
                    Reason (optional)
                  </label>
                  <input
                    id={`${baseId}-cancel-r`}
                    className="b4-field__control"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    disabled={busy !== null}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="plat-bill-actions__ghost"
                  disabled={busy !== null}
                >
                  {busy === "cancel" ? "Cancelling…" : "Confirm cancel"}
                </button>
              </form>
            ) : null}

            {canVoid && openPanel === "void" ? (
              <form className="plat-bill-actions__danger-panel" onSubmit={onVoid}>
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor={`${baseId}-void-r`}>
                    Reason
                  </label>
                  <input
                    id={`${baseId}-void-r`}
                    className="b4-field__control"
                    required
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    disabled={busy !== null}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="plat-bill-actions__ghost"
                  disabled={busy !== null}
                >
                  {busy === "void" ? "Voiding…" : "Confirm void"}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
