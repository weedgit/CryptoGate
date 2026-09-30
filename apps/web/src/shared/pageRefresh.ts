import { useEffect, useRef, useState } from "react";
import { invalidateAllPortalDataCaches } from "./portalDataCaches";
import { requestSessionRefresh } from "./sessionRefresh";

type Handler = () => unknown;

const handlers = new Set<{ current: Handler }>();
const REMOUNT_EVENT = "cg:page-remount";

/**
 * Registers what the top-bar refresh button reloads on this page (keeps filters
 * and open panels). Pages that register nothing are remounted instead.
 */
export function usePageRefresh(handler: Handler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const entry = ref;
    handlers.add(entry);
    return () => {
      handlers.delete(entry);
    };
  }, []);
}

/** Top-bar refresh: drop cached portal data, reload the session, then reload the page. */
export async function triggerPageRefresh(): Promise<void> {
  invalidateAllPortalDataCaches();
  requestSessionRefresh();
  if (handlers.size === 0) {
    window.dispatchEvent(new Event(REMOUNT_EVENT));
    return;
  }
  await Promise.allSettled([...handlers].map((h) => Promise.resolve(h.current())));
}

/** Key for the shell's page area; changes when a page without a handler must remount. */
export function usePageRemountKey(): number {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const bump = () => setKey((k) => k + 1);
    window.addEventListener(REMOUNT_EVENT, bump);
    return () => window.removeEventListener(REMOUNT_EVENT, bump);
  }, []);
  return key;
}
