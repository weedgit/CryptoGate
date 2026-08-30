import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/** Match CSS `--bp-tablet` (1100px). Desktop keeps classic sidebar. */
const TABLET_MQ = "(max-width: 1100px)";

/**
 * Portal shell mobile nav: off-canvas drawer ≤1100px.
 * Closes on route change, Escape, and when resizing back to desktop.
 */
export function usePortalMobileNav() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isTabletOrBelow, setIsTabletOrBelow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(TABLET_MQ).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(TABLET_MQ);
    const sync = () => {
      const matches = mq.matches;
      setIsTabletOrBelow(matches);
      if (!matches) setMobileNavOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(
    () => setMobileNavOpen((v) => !v),
    [],
  );

  return {
    mobileNavOpen,
    isTabletOrBelow,
    openMobileNav,
    closeMobileNav,
    toggleMobileNav,
  };
}
