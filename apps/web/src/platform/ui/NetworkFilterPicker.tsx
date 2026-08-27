import { useEffect, useId, useRef, useState } from "react";
import { NetworkIcon } from "../cryptoIcons";

export type NetworkFilterValue = string;

type Option = {
  id: NetworkFilterValue;
  label: string;
};

type Props = {
  value: NetworkFilterValue;
  options: Option[];
  onChange: (id: NetworkFilterValue) => void;
  /** Prefix for aria ids when multiple pickers on page. */
  label?: string;
};

function FilterNetworkIcon({ network }: { network: NetworkFilterValue }) {
  if (network === "all") {
    return (
      <span className="plat-crypto-icon plat-network-picker__all-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
          <circle cx="8" cy="8" r="3" stroke="#fff" strokeWidth="1.6" />
          <circle cx="16" cy="8" r="3" stroke="#fff" strokeWidth="1.6" />
          <circle cx="12" cy="16" r="3" stroke="#fff" strokeWidth="1.6" />
        </svg>
      </span>
    );
  }
  return <NetworkIcon network={network} />;
}

/**
 * Network filter with chain icons (native select cannot render option icons).
 */
export function NetworkFilterPicker({
  value,
  options,
  onChange,
  label = "Network",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: NetworkFilterValue) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`plat-network-picker${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="plat-network-picker__summary"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${selected?.label ?? value}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="plat-network-filter__label">{label}</span>
        <span className="plat-network-picker__value">
          <FilterNetworkIcon network={value} />
          <span className="plat-network-picker__text">{selected?.label ?? value}</span>
        </span>
      </button>
      {open ? (
        <div
          className="plat-network-picker__menu"
          role="listbox"
          id={listId}
          aria-label={`${label} options`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {options.map((opt) => {
            const on = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={on}
                className={`plat-network-picker__row${on ? " is-on" : ""}`}
                onClick={() => pick(opt.id)}
              >
                <FilterNetworkIcon network={opt.id} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
