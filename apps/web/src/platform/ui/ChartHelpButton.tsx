import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const VOLUME_CHART_HELP =
  "Total shows platform-wide settled payment-order volume for the selected period. " +
  "Scroll to zoom the time window; drag to pan; double-click or Reset to show the full period. " +
  "Asset filters the chart using the network table: click Network (all assets on that chain), " +
  "Asset (that asset on all chains), or a row (one network + asset pair). " +
  "Click the same selection again to clear.";

type Props = {
  text?: string;
  label?: string;
};

type PopoverPos = { top: number; left: number; width: number };

/** Click ? to show chart help in a portaled popover (escapes overflow:hidden panels). */
export function ChartHelpButton({
  text = VOLUME_CHART_HELP,
  label = "Chart help",
}: Props) {
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = Math.min(320, Math.max(240, window.innerWidth - 24));
      let left = rect.right - width;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const top = rect.bottom + 8;
      setPos({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
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
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="chart-help">
      <button
        ref={btnRef}
        type="button"
        className="chart-help__btn"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
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
