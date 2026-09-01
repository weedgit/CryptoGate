import type { PlatformHealthSnapshot } from "./platformHealthAlerts";

type HealthListener = (health: PlatformHealthSnapshot | "unreachable") => void;

let cached: PlatformHealthSnapshot | "unreachable" | null = null;
let lastFetch = 0;
let inflight: Promise<PlatformHealthSnapshot | "unreachable"> | null = null;
const listeners = new Set<HealthListener>();

const INTERVAL_MS = 15_000;
const MIN_GAP_MS = 5_000;

async function probeHealth(): Promise<PlatformHealthSnapshot | "unreachable"> {
  try {
    const base =
      (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ||
      "";
    const res = await fetch(`${base}/health?checkDb=1`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return "unreachable";
    const payload = (await res.json()) as {
      status?: string;
      db?: string;
      webhook?: string;
    };
    if (payload.status !== "ok" && payload.status !== "degraded") {
      return "unreachable";
    }
    return {
      api: payload.status === "ok" || payload.status === "degraded",
      database: payload.db === "ok",
      webhook: payload.webhook === "ok",
    };
  } catch {
    return "unreachable";
  }
}

function emit(next: PlatformHealthSnapshot | "unreachable") {
  cached = next;
  for (const fn of listeners) fn(next);
}

export async function fetchSharedHealth(
  force = false,
): Promise<PlatformHealthSnapshot | "unreachable"> {
  const now = Date.now();
  if (!force && cached && now - lastFetch < MIN_GAP_MS) return cached;
  if (inflight) return inflight;
  inflight = probeHealth().finally(() => {
    inflight = null;
    lastFetch = Date.now();
  });
  const next = await inflight;
  emit(next);
  return next;
}

export function subscribeSharedHealth(listener: HealthListener): () => void {
  listeners.add(listener);
  if (cached) listener(cached);
  return () => listeners.delete(listener);
}

let intervalId: number | null = null;
let subscriberCount = 0;

/** Single 15s health poll shared by shell + connection status. Pauses when tab hidden. */
export function ensureHealthPolling(active: boolean): void {
  if (active) {
    subscriberCount += 1;
    if (intervalId != null) return;
    void fetchSharedHealth(true);
    intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchSharedHealth(true);
    }, INTERVAL_MS);
    return;
  }
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount === 0 && intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}
