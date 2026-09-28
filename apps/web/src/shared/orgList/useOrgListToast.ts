import { useCallback, useState } from "react";

/** Toast + list-level error shared by the Agents / Merchants list pages. */
export function useOrgListToast() {
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "error">("ok");

  const dismissToast = useCallback(() => {
    setMsg(null);
    setError(null);
  }, []);

  const showOk = useCallback((text: string) => {
    setError(null);
    setToastTone("ok");
    setMsg(text);
  }, []);

  const showErr = useCallback((text: string) => {
    setMsg(null);
    setToastTone("error");
    setError(text);
  }, []);

  return {
    error,
    setError,
    toastMessage: error ?? msg,
    toastTone: error ? ("error" as const) : toastTone,
    dismissToast,
    showOk,
    showErr,
  };
}

export type OrgListToast = ReturnType<typeof useOrgListToast>;
