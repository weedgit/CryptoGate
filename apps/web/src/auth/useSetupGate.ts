import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Session } from "../merchant/api";
import {
  SETUP_QUERY_PARAM,
  liveActionLockedHint,
  sessionLiveActionsUnlocked,
  sessionNeedsOrgSetup,
} from "./contactVerification";

/**
 * Keeps live-action buttons clickable before setup is done: returns a guard that
 * opens the Finish account setup modal (or reports the unpaid activation fee)
 * and returns false while the account is still watch-only.
 */
export function useSetupGate(
  session: Session,
  onBlocked: (message: string) => void,
): () => boolean {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (sessionLiveActionsUnlocked(session)) return true;
    if (sessionNeedsOrgSetup(session)) {
      const params = new URLSearchParams(location.search);
      params.set(SETUP_QUERY_PARAM, "1");
      navigate({ pathname: location.pathname, search: `?${params.toString()}` });
    } else {
      onBlocked(liveActionLockedHint(session));
    }
    return false;
  }, [session, onBlocked, navigate, location.pathname, location.search]);
}
