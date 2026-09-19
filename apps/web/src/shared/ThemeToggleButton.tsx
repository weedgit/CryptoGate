import { useEffect, useState } from "react";
import {
  getDocumentColorMode,
  subscribeColorMode,
  toggleColorMode,
  type ColorMode,
} from "./colorMode";

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
    </svg>
  );
}

export function ThemeToggleButton() {
  const [mode, setMode] = useState<ColorMode>(() => getDocumentColorMode());

  useEffect(() => subscribeColorMode(setMode), []);

  const nextIsLight = mode === "dark";

  return (
    <button
      type="button"
      className="chrome-icon-btn theme-toggle-btn"
      aria-label={nextIsLight ? "Switch to light mode" : "Switch to dark mode"}
      title={nextIsLight ? "Light mode" : "Dark mode"}
      onClick={() => setMode(toggleColorMode())}
    >
      {nextIsLight ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
