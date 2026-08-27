import { ClipboardEvent, KeyboardEvent, useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  /** When false, filling 6 digits does not call onComplete (modal submit). Default true. */
  submitOnComplete?: boolean;
  className?: string;
};

const SLOT_COUNT = 6;

export function MfaCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  submitOnComplete = true,
  className,
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: SLOT_COUNT }, (_, index) => value[index] ?? "");

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (
      submitOnComplete &&
      onComplete &&
      value.length === SLOT_COUNT &&
      /^\d{6}$/.test(value)
    ) {
      onComplete(value);
    }
  }, [value, onComplete, submitOnComplete]);

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").replace(/\s/g, ""));
  }

  function onDigitChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigit(index, digit);
    if (digit && index < SLOT_COUNT - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function onDigitKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
      setDigit(index - 1, "");
      event.preventDefault();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, SLOT_COUNT);
    if (!pasted) {
      return;
    }
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, SLOT_COUNT - 1);
    refs.current[focusIndex]?.focus();
  }

  return (
    <div
      className={["login-mfa-slots", className].filter(Boolean).join(" ")}
      role="group"
      aria-label="MFA code"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          className={`login-mfa-slot${digit ? " login-mfa-slot--filled" : ""}${
            index === Math.min(value.length, SLOT_COUNT - 1) ? " is-focus" : ""
          }`}
          style={{ animationDelay: `${index * 60}ms` }}
          value={digit}
          onChange={(event) => onDigitChange(index, event.target.value)}
          onKeyDown={(event) => onDigitKeyDown(index, event)}
          onPaste={onPaste}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
