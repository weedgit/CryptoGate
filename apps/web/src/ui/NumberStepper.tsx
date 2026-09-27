import type { InputHTMLAttributes } from "react";

type Props = {
  id?: string;
  value: string | number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  title?: string;
  onChange: (next: string) => void;
  onBlur?: InputHTMLAttributes<HTMLInputElement>["onBlur"];
};

function clamp(n: number, min?: number, max?: number) {
  let out = n;
  if (typeof min === "number" && Number.isFinite(min)) out = Math.max(min, out);
  if (typeof max === "number" && Number.isFinite(max)) out = Math.min(max, out);
  return out;
}

function SpinChevron({ dir }: { dir: "up" | "down" }) {
  return (
    <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
      {dir === "up" ? (
        <path fill="currentColor" d="M6 1.1 11 6.9H1Z" />
      ) : (
        <path fill="currentColor" d="M6 6.9 1 1.1h10Z" />
      )}
    </svg>
  );
}

/** Number input with custom full-height up/down steppers (native spinners hidden). */
export function NumberStepper({
  id,
  value,
  min,
  max,
  step = 1,
  disabled,
  className,
  inputClassName,
  "aria-label": ariaLabel,
  title,
  onChange,
  onBlur,
}: Props) {
  function bump(delta: number) {
    if (disabled) return;
    const raw = typeof value === "number" ? value : Number(value);
    const base = Number.isFinite(raw) ? raw : (min ?? 0);
    const next = clamp(base + delta, min, max);
    onChange(String(next));
  }

  const atMax =
    typeof max === "number" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= max;
  const atMin =
    typeof min === "number" &&
    Number.isFinite(Number(value)) &&
    Number(value) <= min;

  return (
    <div
      className={["cg-number-stepper", className].filter(Boolean).join(" ")}
    >
      <input
        id={id}
        className={["cg-number-stepper__input", inputClassName]
          .filter(Boolean)
          .join(" ")}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <div className="cg-number-stepper__spin" aria-hidden={disabled || undefined}>
        <button
          type="button"
          className="cg-number-stepper__btn"
          tabIndex={-1}
          disabled={disabled || atMax}
          aria-label={ariaLabel ? `Increase ${ariaLabel}` : "Increase"}
          onClick={() => bump(step)}
        >
          <SpinChevron dir="up" />
        </button>
        <button
          type="button"
          className="cg-number-stepper__btn"
          tabIndex={-1}
          disabled={disabled || atMin}
          aria-label={ariaLabel ? `Decrease ${ariaLabel}` : "Decrease"}
          onClick={() => bump(-step)}
        >
          <SpinChevron dir="down" />
        </button>
      </div>
    </div>
  );
}
