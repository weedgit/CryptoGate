import { useState } from "react";
import { triggerPageRefresh } from "./pageRefresh";

/** Top-bar control that reloads the current page's data (sits left of the alerts bell). */
export function PageRefreshButton() {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.all([
        triggerPageRefresh(),
        new Promise((resolve) => window.setTimeout(resolve, 450)),
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`chrome-icon-btn page-refresh-btn${busy ? " is-spinning" : ""}`}
      aria-label="Refresh page"
      title="Refresh"
      aria-busy={busy}
      onClick={() => void onClick()}
    >
      <svg
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
        <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
        <path d="M4 3.5V8h4.5" />
        <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
        <path d="M20 20.5V16h-4.5" />
      </svg>
    </button>
  );
}
