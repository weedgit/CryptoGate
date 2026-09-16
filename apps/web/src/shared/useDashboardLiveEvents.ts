import { useEffect, useRef } from "react";

export type DashboardLiveSlice =
  | "volume"
  | "anomalies"
  | "serviceBills"
  | "orgs"
  | "commissions"
  | "networks";

export type DashboardLiveEvent = {
  type: string;
  slices: DashboardLiveSlice[];
  orgId?: string | null;
  parentId?: string | null;
  orderId?: string;
  orderNumber?: string;
  broadcast?: boolean;
  at: string;
};

type Options = {
  /** When false, no EventSource is opened. */
  enabled?: boolean;
  /** Debounce window for merging slice invalidations. Default 400ms. */
  debounceMs?: number;
  /**
   * Called with the union of slices from recent events.
   * Should soft-revalidate (SWR) only those slices — no full blank reload.
   */
  onSlices: (slices: DashboardLiveSlice[]) => void;
};

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "/v1";

/**
 * SSE + debounced slice invalidation for portal dashboards.
 * Relies on same-origin `/v1` proxy so session cookies are sent.
 */
export function useDashboardLiveEvents({
  enabled = true,
  debounceMs = 400,
  onSlices,
}: Options): void {
  const onSlicesRef = useRef(onSlices);
  onSlicesRef.current = onSlices;
  const pendingRef = useRef<Set<DashboardLiveSlice>>(new Set());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const flush = () => {
      timerRef.current = null;
      if (pendingRef.current.size === 0) return;
      const slices = [...pendingRef.current];
      pendingRef.current.clear();
      onSlicesRef.current(slices);
    };

    const queue = (slices: DashboardLiveSlice[]) => {
      for (const s of slices) pendingRef.current.add(s);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, debounceMs);
    };

    const url = `${API_BASE}/events`;
    const es = new EventSource(url, { withCredentials: true });

    const onDashboard = (ev: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(ev.data) as DashboardLiveEvent;
        if (!payload?.slices?.length) return;
        queue(payload.slices);
      } catch {
        // ignore malformed
      }
    };

    es.addEventListener("dashboard", onDashboard as EventListener);

    return () => {
      es.removeEventListener("dashboard", onDashboard as EventListener);
      es.close();
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current.clear();
    };
  }, [enabled, debounceMs]);
}
