import { useEffect } from "react";

type Props = {
  message: string | null;
  tone?: "error" | "ok";
  onDismiss: () => void;
  durationMs?: number;
};

/** Fixed toast for auth alarms (login / forgot / reset). */
export function AuthToast({
  message,
  tone = "error",
  onDismiss,
  durationMs = 6000,
}: Props) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={`auth-toast auth-toast--${tone}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="auth-toast__msg">{message}</span>
      <button type="button" className="auth-toast__close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
