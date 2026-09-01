import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../auth/useReducedMotion";

/** Chart-like settle: fast start, ease into the final value. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Short tween; slightly longer for bigger jumps, always under 1s. */
export function fundTweenMs(from: number, to: number): number {
  const delta = Math.abs(to - from);
  if (delta < 0.005) return 0;
  return Math.round(
    Math.min(880, Math.max(420, 400 + Math.log10(1 + delta) * 150)),
  );
}

/**
 * Count a money figure from 0 on first paint, then up/down when `target` changes.
 */
export function useAnimatedNumber(target: number): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(() => (reduced ? target : 0));
  const shownRef = useRef(shown);
  const pendingFirst = useRef(true);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (reduced) {
      pendingFirst.current = false;
      shownRef.current = target;
      setShown(target);
      return;
    }

    const from = pendingFirst.current ? 0 : shownRef.current;
    const duration = fundTweenMs(from, target);
    if (duration === 0) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    pendingFirst.current = false;

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const next = from + (target - from) * easeOutCubic(t);
      shownRef.current = next;
      setShown(next);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        shownRef.current = target;
        setShown(target);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);

  return shown;
}
