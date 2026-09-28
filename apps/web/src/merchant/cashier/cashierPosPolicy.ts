import { useEffect, useState } from "react";
import { getPosSettings } from "../api";

export const POS_ONLY_NOTE = "Charging is done in the POS app";

const cache = new Map<string, boolean>();
const inflight = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function peekCashierWebOrders(orgId: string | null): boolean | null {
  if (!orgId) return null;
  return cache.has(orgId) ? (cache.get(orgId) as boolean) : null;
}

/** Fails open on network errors: the API still rejects blocked web charges. */
export function loadCashierWebOrders(orgId: string, force = false): Promise<boolean> {
  if (!force && cache.has(orgId)) return Promise.resolve(cache.get(orgId) as boolean);
  const pending = inflight.get(orgId);
  if (pending) return pending;
  const p = getPosSettings(orgId)
    .then((s) => s.cashierWebOrders !== false)
    .catch(() => cache.get(orgId) ?? true)
    .then((allowed) => {
      const changed = cache.get(orgId) !== allowed;
      cache.set(orgId, allowed);
      if (changed) emit();
      return allowed;
    })
    .finally(() => inflight.delete(orgId));
  inflight.set(orgId, p);
  return p;
}

/** The API answered `cashier_web_orders_disabled`; switch the terminal to POS-only now. */
export function markCashierWebOrdersDisabled(orgId: string | null): void {
  if (!orgId || cache.get(orgId) === false) return;
  cache.set(orgId, false);
  emit();
}

/** `null` while the merchant policy is loading. Rechecks when the tab regains focus. */
export function useCashierWebOrders(orgId: string | null): boolean | null {
  const [allowed, setAllowed] = useState(() => peekCashierWebOrders(orgId));

  useEffect(() => {
    if (!orgId) return;
    const sync = () => setAllowed(peekCashierWebOrders(orgId));
    listeners.add(sync);
    sync();
    void loadCashierWebOrders(orgId);
    const onFocus = () => {
      if (document.visibilityState === "visible") void loadCashierWebOrders(orgId, true);
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      listeners.delete(sync);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [orgId]);

  return orgId ? allowed : true;
}
