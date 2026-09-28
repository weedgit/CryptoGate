import { useEffect, useRef, useState } from "react";

export const CASHIER_IDLE_TIMEOUT_MS = 15 * 60_000;
export const CASHIER_IDLE_WARNING_MS = 60_000;

const STORAGE_KEY = "paymentgate.cashier.lastActivity";
const STORE_THROTTLE_MS = 5_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

let holds = 0;

/** Pause idle sign-out (e.g. while a customer is paying). Returns the release function. */
export function holdCashierIdle(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
  };
}

function readShared(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeShared(at: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    /* ignore */
  }
}

/** Milliseconds left before sign-out, given the latest input seen in any tab. */
export function idleRemainingMs(lastActivityAt: number, now: number, timeoutMs = CASHIER_IDLE_TIMEOUT_MS): number {
  return Math.max(0, lastActivityAt + timeoutMs - now);
}

/**
 * Signs the cashier out after `timeoutMs` without input. Returns the seconds
 * left once inside the warning window, otherwise `null`.
 */
export function useIdleSignOut({
  enabled,
  onTimeout,
  timeoutMs = CASHIER_IDLE_TIMEOUT_MS,
  warningMs = CASHIER_IDLE_WARNING_MS,
}: {
  enabled: boolean;
  onTimeout: () => void;
  timeoutMs?: number;
  warningMs?: number;
}): { secondsLeft: number | null; stayActive: () => void } {
  const lastRef = useRef(Date.now());
  const storedRef = useRef(0);
  const firedRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const markActive = useRef(() => {
    const now = Date.now();
    lastRef.current = now;
    if (now - storedRef.current >= STORE_THROTTLE_MS) {
      storedRef.current = now;
      writeShared(now);
    }
  });

  useEffect(() => {
    if (!enabled) return;
    firedRef.current = false;
    markActive.current();
    const onActivity = () => markActive.current();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    const tick = () => {
      if (holds > 0) markActive.current();
      const last = Math.max(lastRef.current, readShared());
      const left = idleRemainingMs(last, Date.now(), timeoutMs);
      if (left <= 0) {
        if (!firedRef.current) {
          firedRef.current = true;
          onTimeoutRef.current();
        }
        return;
      }
      setSecondsLeft(left <= warningMs ? Math.ceil(left / 1000) : null);
    };
    tick();
    const interval = window.setInterval(tick, 1_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      setSecondsLeft(null);
    };
  }, [enabled, timeoutMs, warningMs]);

  return {
    secondsLeft,
    stayActive: () => {
      storedRef.current = 0;
      markActive.current();
      setSecondsLeft(null);
    },
  };
}
