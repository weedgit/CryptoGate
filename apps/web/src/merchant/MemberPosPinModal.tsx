import { useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { OrgEditWaves } from "../shared/OrgEditWaves";
import { FieldControl } from "../ui/FieldControl";

type Props = {
  email: string;
  pin: string;
  confirm: string;
  busy: boolean;
  onPinChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onClose: () => void;
  onSave: (e: FormEvent) => void;
  onClear: () => void;
};

function PinPadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 7.5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8.6" cy="11.6" r="1" fill="currentColor" />
      <circle cx="12" cy="11.6" r="1" fill="currentColor" />
      <circle cx="15.4" cy="11.6" r="1" fill="currentColor" />
      <circle cx="8.6" cy="15.4" r="1" fill="currentColor" />
      <circle cx="12" cy="15.4" r="1" fill="currentColor" />
      <circle cx="15.4" cy="15.4" r="1" fill="currentColor" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9.2L19.5 7.8V18.5A1.5 1.5 0 0 1 18 20H6.5A1.5 1.5 0 0 1 5 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 4.5V9h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 20v-5.2h8V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 8);

/** Owner/Admin sets or clears a member's Cashier POS PIN. */
export function MemberPosPinModal({
  email,
  pin,
  confirm,
  busy,
  onPinChange,
  onConfirmChange,
  onClose,
  onSave,
  onClear,
}: Props) {
  const titleId = useId();
  const pinId = useId();
  const confirmId = useId();
  const [showPin, setShowPin] = useState(false);
  const mismatch = confirm.length > 0 && pin.length > 0 && confirm !== pin;
  const tooShort = pin.length > 0 && pin.length < 4;

  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="b3-commission-modal pos-pin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="org-edit__head">
          <span className="org-edit__head-icon" aria-hidden>
            <PinPadIcon />
          </span>
          <div className="org-edit__head-copy">
            <h3 id={titleId}>Cashier POS PIN</h3>
            <p>
              Set or clear the terminal unlock PIN for <strong>{email}</strong>. Their
              current PIN is not required.
            </p>
          </div>
          <OrgEditWaves />
          <button
            type="button"
            className="org-edit__close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <form onSubmit={onSave} noValidate>
          <div className="pos-pin-modal__body">
            <label className="pos-pin-modal__field" htmlFor={pinId}>
              <span className="pos-pin-modal__label">New PIN</span>
              <FieldControl
                icon="lock"
                invalid={tooShort}
                showPassword={showPin}
                onTogglePassword={() => setShowPin((v) => !v)}
                toggleDisabled={busy}
              >
                <input
                  id={pinId}
                  className="field-control pos-pin-modal__input"
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  value={pin}
                  onChange={(e) => onPinChange(digitsOnly(e.target.value))}
                  disabled={busy}
                  maxLength={8}
                  placeholder="4–8 digits"
                />
              </FieldControl>
            </label>
            <label className="pos-pin-modal__field" htmlFor={confirmId}>
              <span className="pos-pin-modal__label">Confirm PIN</span>
              <FieldControl icon="lock" invalid={mismatch}>
                <input
                  id={confirmId}
                  className="field-control pos-pin-modal__input"
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="off"
                  value={confirm}
                  onChange={(e) => onConfirmChange(digitsOnly(e.target.value))}
                  disabled={busy}
                  maxLength={8}
                  placeholder="Repeat the PIN"
                />
              </FieldControl>
            </label>
            {mismatch ? (
              <p className="pos-pin-modal__error">PINs do not match.</p>
            ) : (
              <p className="pos-pin-modal__hint">
                The cashier enters this PIN to unlock the POS terminal.
              </p>
            )}
          </div>
          <footer className="org-edit__foot pos-pin-modal__foot">
            <button
              type="button"
              className="org-edit__cancel pos-pin-modal__clear"
              disabled={busy}
              onClick={onClear}
            >
              <ClearIcon />
              Clear PIN
            </button>
            <div className="pos-pin-modal__actions">
              <button
                type="button"
                className="org-edit__cancel"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="org-edit__save"
                disabled={busy || pin.length < 4 || pin !== confirm}
              >
                <SaveIcon />
                {busy ? "Saving…" : "Save PIN"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
