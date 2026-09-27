import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { dismissToast, subscribeToast, type ToastEntry } from "./toast";

/** Single app-wide toast slot (bottom centre). Mounted once at the app root. */
export function ToastHost() {
  const [entry, setEntry] = useState<ToastEntry | null>(null);

  useEffect(() => subscribeToast(setEntry), []);

  useEffect(() => {
    if (!entry) return;
    const t = window.setTimeout(() => dismissToast(entry.id), entry.durationMs);
    return () => window.clearTimeout(t);
  }, [entry]);

  if (!entry || typeof document === "undefined") return null;

  return createPortal(
    <div
      key={entry.id}
      className={`auth-toast auth-toast--${entry.tone}`}
      role={entry.tone === "error" ? "alert" : "status"}
      aria-live={entry.tone === "error" ? "assertive" : "polite"}
    >
      <span className="auth-toast__msg">{entry.message}</span>
      <button
        type="button"
        className="auth-toast__close"
        onClick={() => dismissToast(entry.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
