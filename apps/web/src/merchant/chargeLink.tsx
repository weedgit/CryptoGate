import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";

const RETURN_KEY = "cg.chargeReturnTo";

type ChargeLinkState = { chargeReturnTo?: string };

function isPortalPage(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const base = merchantRoute();
  if (path !== base && !path.startsWith(`${base}/`)) return false;
  const rest = path.slice(base.length);
  return !/^\/(charge|pay\/)/.test(rest);
}

/** Link to the Charge terminal that remembers the current page for "Back to portal". */
export function ChargeLink({ className, children }: { className?: string; children: ReactNode }) {
  const location = useLocation();
  const state: ChargeLinkState = { chargeReturnTo: `${location.pathname}${location.search}` };
  return (
    <Link className={className} to={merchantRoute("charge")} state={state}>
      {children}
    </Link>
  );
}

/**
 * Page the merchant opened Charge from. Kept for the tab session so it survives
 * Charge → live payment → New sale, where router state is replaced.
 */
export function useChargeReturnTo(): string {
  const location = useLocation();
  const from = (location.state as ChargeLinkState | null)?.chargeReturnTo;
  if (isPortalPage(from)) {
    try {
      sessionStorage.setItem(RETURN_KEY, from);
    } catch {
      /* private mode */
    }
    return from;
  }
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(RETURN_KEY);
  } catch {
    /* private mode */
  }
  return isPortalPage(stored) ? stored : merchantRoute();
}
