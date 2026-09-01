import { useCallback, useEffect, useState } from "react";
import { getSession, loadPortalSession, type Session } from "../merchant/api";
import { setUserTimezone } from "../shared/userTimezone";
import { prefetchCurrentPortalRoute } from "../shared/prefetchCurrentRoute";
import { prefetchPortalDashboardData } from "../shared/prefetchPortalDashboardData";
import {
  registerSessionAuthHandlers,
  setSessionAuthActive,
} from "./apiFetch";
import { clearChunkReloadFlag } from "../shared/lazyChunkRecovery";
import { readCachedSession, writeCachedSession } from "./sessionCache";

const DEFAULT_TIMEOUT_MIN = 120;

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
  const [session, setSessionState] = useState<Session | null>(() =>
    readCachedSession(),
  );
  const [mfaPending, setMfaPending] = useState(false);
  const [booting, setBooting] = useState(() => readCachedSession() == null);

  const setSession = useCallback((next: Session | null) => {
    setSessionState(next);
    writeCachedSession(next);
  }, []);

  useEffect(() => {
    if (readCachedSession()) {
      prefetchCurrentPortalRoute();
      prefetchPortalDashboardData();
    }

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
      .finally(() => {
        setBooting(false);
        clearChunkReloadFlag();
      });
  }, [setSession]);

  useEffect(() => {
    registerSessionAuthHandlers({
      onSessionExpired: () => {
        setSession(null);
        setMfaPending(false);
      },
      onMfaRequired: () => {
        setSession(null);
        setMfaPending(true);
      },
    });
    return () => registerSessionAuthHandlers({});
  }, []);

  useEffect(() => {
    setSessionAuthActive(session != null);
  }, [session]);

  useSessionKeepAlive(session, setSession);

  useEffect(() => {
    setUserTimezone(session?.timezone);
  }, [session?.timezone]);

  function completeSignIn() {
    setMfaPending(false);
    getSession()
      .then(setSession)
      .catch(() => setSession(null));
  }

  return { session, setSession, mfaPending, booting, completeSignIn };
}
