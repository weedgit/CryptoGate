import { useLayoutEffect, useState, type RefObject } from "react";

/** Top-bar portal targets rendered by the platform and agent shells. */
export function useTopbarSlots() {
  const [center, setCenter] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setCenter(document.getElementById("platform-topbar-center"));
    setActions(document.getElementById("platform-topbar-actions"));
  }, []);
  return { center, actions };
}

/**
 * Keeps `--org-agents-sticky-top` on the page element equal to the top bar's
 * bottom edge so sticky table headers sit just under it.
 */
export function useStickyTopOffset(
  pageRef: RefObject<HTMLElement | null>,
  shellSelector: string,
  dep: unknown,
) {
  useLayoutEffect(() => {
    const pageEl = pageRef.current;
    const main = document.querySelector(`${shellSelector} .main`);
    const topbar = document.querySelector(`${shellSelector} .topbar`);
    if (!pageEl || !(main instanceof HTMLElement) || !(topbar instanceof HTMLElement)) {
      return;
    }

    const syncStickyTop = () => {
      const mainTop = main.getBoundingClientRect().top;
      const topbarBottom = topbar.getBoundingClientRect().bottom;
      const stickyTop = Math.max(0, Math.ceil(topbarBottom - mainTop));
      pageEl.style.setProperty("--org-agents-sticky-top", `${stickyTop}px`);
    };

    syncStickyTop();
    const ro = new ResizeObserver(syncStickyTop);
    ro.observe(topbar);
    ro.observe(main);
    window.addEventListener("resize", syncStickyTop);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncStickyTop);
    };
  }, [pageRef, shellSelector, dep]);
}
