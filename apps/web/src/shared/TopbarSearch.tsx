import { useId } from "react";

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

/** Chrome search — visual utility; pages can listen for `paymentgate:topbar-search`. */
export function TopbarSearch({ placeholder = "Search" }: { placeholder?: string }) {
  const id = useId();

  return (
    <label className="topbar-search" htmlFor={id}>
      <SearchIcon />
      <input
        id={id}
        type="search"
        className="topbar-search__input"
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const q = (e.target as HTMLInputElement).value.trim();
          window.dispatchEvent(
            new CustomEvent("paymentgate:topbar-search", { detail: { q } }),
          );
        }}
      />
    </label>
  );
}
