import { useEffect, useRef } from "react";
import { dismissToast, showToast } from "../shared/toast";

type Props = {
  message: string | null;
  tone?: "error" | "ok" | "info";
  onDismiss: () => void;
  durationMs?: number;
};

/**
 * Page-level hook into the single app-wide toast (rendered by ToastHost).
 * Setting `message` shows it; `onDismiss` runs when it times out, is closed,
 * or is replaced by another toast.
 */
export function AuthToast({
  message,
  tone = "error",
  onDismiss,
  durationMs = 6000,
}: Props) {
  const idRef = useRef(0);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) {
      if (idRef.current) {
        const id = idRef.current;
        idRef.current = 0;
        dismissToast(id);
      }
      return;
    }
    idRef.current = showToast(message, {
      tone,
      durationMs,
      onDismiss: () => {
        idRef.current = 0;
        dismissRef.current();
      },
    });
  }, [message, tone, durationMs]);

  return null;
}
