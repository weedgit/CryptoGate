import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const VOLUME_CHART_HELP =
  "Total shows platform-wide settled payment-order volume for the selected period. " +
  "Use + / − to zoom the time window; drag to pan when zoomed; double-click or Reset to show the full period. " +
  "Asset filters the chart using the network table: click Network (all assets on that chain), " +
  "Asset (that asset on all chains), or a row (one network + asset pair). " +
  "Click the same selection again to clear.";

type Props = {
  text?: string;
  label?: string;
  /** Card ? tips: open on hover as well as click. Chart tools stay click-only. */
  openOnHover?: boolean;
};

type PopoverPos = { top: number; left: number; width: number };

/** Click ? to show help in a portaled popover (escapes overflow:hidden panels). */
export function ChartHelpButton({
  text = VOLUME_CHART_HELP,
  label = "Chart help",
  openOnHover = false,
}: Props) {
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const hoverOpen = () => {
    if (!openOnHover) return;
    cancelClose();
    setOpen(true);
  };

  const hoverClose = () => {
    if (!openOnHover) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 24);
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const gap = 8;
      const popH = popoverRef.current?.offsetHeight ?? 0;
      const below = rect.bottom + gap;
      let top = below;
      if (popH > 0) {
        const spaceBelow = window.innerHeight - below - 12;
        const above = rect.top - gap - popH;
        if (spaceBelow < popH && above >= 12) {
          top = above;
        } else {
          top = Math.min(below, Math.max(12, window.innerHeight - popH - 12));
        }
      }
      setPos((prev) => {
        if (
          prev &&
          prev.top === top &&
          prev.left === left &&
          prev.width === width
        ) {
          return prev;
        }
        return { top, left, width };
      });
    };
    place();
    const frame = requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      cancelClose();
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelClose();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  return (
    <div ref={rootRef} className="chart-help">
      <button
        ref={btnRef}
        type="button"
        className="chart-help__btn"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={label}
        onClick={() => {
          cancelClose();
          setOpen((prev) => !prev);
        }}
        onMouseEnter={hoverOpen}
        onMouseLeave={hoverClose}
      >
        ?
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              className="chart-help__popover chart-help__popover--portal"
              role="dialog"
              aria-label={label}
              onMouseEnter={hoverOpen}
              onMouseLeave={hoverClose}
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
              }}
            >
              <p>{text}</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
