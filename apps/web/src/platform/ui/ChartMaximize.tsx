import {
  useEffect,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";

/** Expand-corners icon for chart maximize. */
export function MaximizeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChartMaximizeButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="chart-maximize-btn"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <MaximizeIcon />
    </button>
  );
}

type OverlayProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Optional controls in the header (filters, etc.). Ignored when `header` is set. */
  toolbar?: ReactNode;
  /**
   * Custom header content (full row). When set, replaces the default title + toolbar.
   * Include your own close control, or omit and use the default close via toolbar layout.
   */
  header?: ReactNode;
  children: ReactNode;
};

/**
 * Near-fullscreen chart viewer. Escape / backdrop / close dismiss it.
 */
export function ChartMaximizeOverlay({
  open,
  title,
  onClose,
  toolbar,
  header,
  children,
}: OverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const onBackdrop = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const closeBtn = (
    <button
      type="button"
      className="chart-maximize-overlay__close"
      aria-label="Close fullscreen chart"
      onClick={onClose}
    >
      ×
    </button>
  );

  return createPortal(
    <div
      className="chart-maximize-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onBackdrop}
    >
      <div className="chart-maximize-overlay__panel">
        <header
          className={`chart-maximize-overlay__head${header ? " chart-maximize-overlay__head--custom" : ""}`}
        >
          {header ? (
            header
          ) : (
            <>
              <h2 className="chart-maximize-overlay__title">{title}</h2>
              <div className="chart-maximize-overlay__actions">
                {toolbar}
                {closeBtn}
              </div>
            </>
          )}
        </header>
        <div className="chart-maximize-overlay__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
