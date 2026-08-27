import { useEffect, useState } from "react";
import { getSession, loadPortalSession, type Session } from "../merchant/api";

const DEFAULT_TIMEOUT_MIN = 30;

/**
 * Sliding keep-alive: refresh session TTL on an interval derived from
 * platform `sessionTimeoutMinutes`, and when the tab becomes visible again.
 */
function useSessionKeepAlive(
  session: Session | null,
  setSession: (session: Session | null) => void,
) {
  useEffect(() => {
    if (!session) return;

    const timeoutMin = session.sessionTimeoutMinutes ?? DEFAULT_TIMEOUT_MIN;
    const intervalMs = Math.max(
      60_000,
      Math.floor((timeoutMin * 60_000) / 3),
    );

    let cancelled = false;

    const refresh = () => {
      void getSession()
        .then((next) => {
          if (!cancelled) setSession(next);
        })
        .catch(() => {
          if (!cancelled) setSession(null);
        });
    };

    const id = window.setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, setSession]);
}

/**
 * Portal boot: full session, MFA step-up pending, or signed out.
 * A 401 mfa_required must not be treated as a missing cookie.
 */
export function usePortalBoot() {
  const [session, setSession] = useState<Session | null>(null);
  const [mfaPending, setMfaPending] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    loadPortalSession()
      .then((boot) => {
        if (boot.status === "ok") {
          setSession(boot.session);
          setMfaPending(false);
          return;
        }
        setSession(null);
        setMfaPending(boot.status === "mfa_required");
      })
      .finally(() => setBooting(false));
  }, []);

  useSessionKeepAlive(session, setSession);

  function completeSignIn() {
    setMfaPending(false);
    getSession()
      .then(setSession)
      .catch(() => setSession(null));
  }

  return { session, setSession, mfaPending, booting, completeSignIn };
}
