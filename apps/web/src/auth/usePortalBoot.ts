import { useEffect, useState } from "react";
import { getSession, loadPortalSession, type Session } from "../merchant/api";

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

  function completeSignIn() {
    setMfaPending(false);
    getSession()
      .then(setSession)
      .catch(() => setSession(null));
  }

  return { session, setSession, mfaPending, booting, completeSignIn };
}
