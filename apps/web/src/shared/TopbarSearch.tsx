import { useId, type KeyboardEvent } from "react";

function SearchIcon() {
  return (
    <svg
      className="topbar-search__icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

type TopbarSearchProps = {
  placeholder?: string;
  /** Controlled value — when set, page owns the query. */
  value?: string;
  onChange?: (value: string) => void;
  onEnter?: (value: string) => void;
  "aria-label"?: string;
};

/** Chrome search — visual utility; pages can listen for `paymentgate:topbar-search`. */
export function TopbarSearch({
  placeholder = "Search",
  value,
  onChange,
  onEnter,
  "aria-label": ariaLabel,
}: TopbarSearchProps) {
  const id = useId();
  const controlled = value !== undefined;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = (e.target as HTMLInputElement).value.trim();
    if (onEnter) {
      onEnter(q);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("paymentgate:topbar-search", { detail: { q } }),
    );
  };

  return (
    <label className="topbar-search" htmlFor={id}>
      <SearchIcon />
      <input
        id={id}
        type="search"
        className="topbar-search__input"
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        {...(controlled
          ? { value, onChange: (e) => onChange?.(e.target.value) }
          : {})}
        onKeyDown={handleKeyDown}
      />
    </label>
  );
}
