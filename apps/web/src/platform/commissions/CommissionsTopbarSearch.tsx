import { createPortal } from "react-dom";

export function CommissionsTopbarSearch({
  slot,
  inputId,
  query,
  onQueryChange,
}: {
  slot: HTMLElement | null;
  inputId: string;
  query: string;
  onQueryChange: (next: string) => void;
}) {
  return slot
    ? createPortal(
        <label className="topbar-search" htmlFor={inputId}>
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
          <input
            id={inputId}
            className="topbar-search__input"
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search agent, period, address, or ref…"
            aria-label="Search commissions"
          />
        </label>,
        slot,
      )
    : null;
}
