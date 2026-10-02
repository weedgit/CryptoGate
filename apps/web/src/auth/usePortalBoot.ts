import { useCallback, useEffect, useRef, useState } from "react";
import { getSession, loadPortalSession, type Session } from "../merchant/api";
import {
  browserTimeZone,
  isValidTimeZone,
  setViewerTimeZone,
} from "../shared/dateTime";
import { showToast } from "../shared/toast";
import { timeZoneShortLabel } from "../shared/timeZoneOptions";
import { prefetchCurrentPortalRoute } from "../shared/prefetchCurrentRoute";
import { prefetchPortalDashboardData } from "../shared/prefetchPortalDashboardData";
import { invalidateAllPortalDataCaches } from "../shared/portalDataCaches";
import {
  registerSessionAuthHandlers,
  setSessionAuthActive,
} from "./apiFetch";
import { clearChunkReloadFlag } from "../shared/lazyChunkRecovery";
import { readCachedSession, writeCachedSession } from "./sessionCache";
import { notifyProfileUpdated, profileSignature } from "../shared/profileUpdated";
import { SESSION_REFRESH_EVENT } from "../shared/sessionRefresh";

const DEFAULT_TIMEOUT_MIN = 120;

/** Once per signed-in user: toast when the browser zone differs from business. */
function toastBusinessTzMismatch(session: Session) {
  const business = session.businessTimezone?.trim();
  if (!isValidTimeZone(business)) return;
  const device = browserTimeZone();
  if (device === business) return;
  showToast(
    `Your device is ${timeZoneShortLabel(device)}; times use business zone ${timeZoneShortLabel(business)}.`,
    { tone: "info", durationMs: 8000 },
  );
}

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

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const setSession = useCallback((next: Session | null) => {
    const prev = sessionRef.current;
    const sameUser = Boolean(prev && next && prev.userId === next.userId);
    const profileChanged = sameUser && profileSignature(prev) !== profileSignature(next);
    sessionRef.current = next;
    setSessionState((current) => {
      if (current?.userId !== next?.userId) {
        invalidateAllPortalDataCaches();
      }
      return next;
    });
    writeCachedSession(next);
    if (profileChanged) notifyProfileUpdated();
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
        invalidateAllPortalDataCaches();
        setSession(null);
        setMfaPending(false);
      },
      onMfaRequired: () => {
        invalidateAllPortalDataCaches();
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
    let seq = 0;
    const onRefresh = () => {
      if (!sessionRef.current) return;
      const mine = ++seq;
      void getSession()
        .then((next) => {
          if (mine === seq && sessionRef.current) setSession(next);
        })
        .catch(() => {});
    };
    window.addEventListener(SESSION_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SESSION_REFRESH_EVENT, onRefresh);
  }, [setSession]);

  // Before children render so their first date math and fetches use the business zone.
  setViewerTimeZone(session?.businessTimezone);

  const signedInUserId = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.userId ?? null;
    if (uid && uid !== signedInUserId.current) {
      toastBusinessTzMismatch(session!);
    }
    signedInUserId.current = uid;
  }, [session]);

  function completeSignIn() {
    setMfaPending(false);
    getSession()
      .then(setSession)
      .catch(() => setSession(null));
  }

  return { session, setSession, mfaPending, booting, completeSignIn };
}
