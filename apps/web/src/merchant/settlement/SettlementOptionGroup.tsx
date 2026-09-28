import type { ReactNode } from "react";

export type SettlementOption = {
  id: string;
  eyebrow: string;
  value: ReactNode;
  hint: ReactNode;
  tip?: string;
  tipLabel?: string;
  disabled?: boolean;
  className?: string;
};

type Props = {
  ariaLabel: string;
  options: SettlementOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  variant?: "listbox" | "radiogroup";
  duo?: boolean;
  locked?: boolean;
  tipIdPrefix?: string;
};

/** Gold option cards used by matching, fulfillment and pricing pickers. */
export function SettlementOptionGroup({
  ariaLabel,
  options,
  selectedId,
  onSelect,
  variant = "listbox",
  duo = false,
  locked = false,
  tipIdPrefix = "settlement-option-tip",
}: Props) {
  return (
    <div
      className={`plat-settlement__stats plat-settlement__stats--pick${
        duo ? " plat-settlement__stats--duo" : ""
      }`}
      role={variant}
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        const tipId = opt.tip ? `${tipIdPrefix}-${opt.id}` : undefined;
        return (
          <button
            key={opt.id}
            type="button"
            role={variant === "listbox" ? "option" : "radio"}
            aria-selected={variant === "listbox" ? selected : undefined}
            aria-checked={variant === "radiogroup" ? selected : undefined}
            aria-disabled={opt.disabled || undefined}
            aria-describedby={tipId}
            disabled={locked || opt.disabled}
            className={`plat-settlement__stat plat-settlement__stat-pick${
              selected ? " is-selected" : ""
            }${opt.className ? ` ${opt.className}` : ""}`}
            onClick={() => {
              if (!opt.disabled) onSelect(opt.id);
            }}
          >
            {opt.tip ? (
              <span className="plat-card-help plat-settlement__stat-pick-help">
                <span
                  className="plat-card-help__btn"
                  aria-label={opt.tipLabel ?? `About ${opt.eyebrow}`}
                  tabIndex={-1}
                >
                  ?
                </span>
                <span id={tipId} className="plat-card-help__tip" role="tooltip">
                  {opt.tip}
                </span>
              </span>
            ) : null}
            <span className="plat-settlement__stat-label">
              {opt.eyebrow}
              {selected ? (
                <span className="plat-settlement__stat-selected-tag">Selected</span>
              ) : null}
            </span>
            <strong className="plat-settlement__stat-value">{opt.value}</strong>
            <span className="plat-settlement__stat-hint">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
