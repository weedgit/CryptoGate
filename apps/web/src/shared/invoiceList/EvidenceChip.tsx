import { useCallback, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { InvoiceConversion } from "../invoiceListModel";

const TIP_WIDTH = 300;

/** Rate evidence chip; the hover card is portalled so the scrolling table cannot clip it. */
export function EvidenceChip({ evidence }: { evidence: InvoiceConversion["evidence"] }) {
  const tipId = useId();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const open = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - TIP_WIDTH - 8));
    setPos({ left, top: r.bottom + 8 });
  }, []);
  const close = useCallback(() => setPos(null), []);

  return (
    <>
      <button
        type="button"
        className={`invoice-list__evidence-chip is-${evidence.kind}`}
        aria-describedby={pos ? tipId : undefined}
        onMouseEnter={(e) => open(e.currentTarget)}
        onMouseLeave={close}
        onFocus={(e) => open(e.currentTarget)}
        onBlur={close}
      >
        <svg
          viewBox="0 0 16 16"
          width="11"
          height="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8 1.8 2.8 3.9v3.6c0 3 2.2 5.6 5.2 6.7 3-1.1 5.2-3.7 5.2-6.7V3.9Z" />
          {evidence.kind === "derived" ? (
            <path d="M8 5.5v3M8 10.6v.1" />
          ) : (
            <path d="m5.7 8 1.6 1.6 3-3.1" />
          )}
        </svg>
        {evidence.label}
      </button>
      {pos
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className="invoice-list__evidence-tip"
              style={{ left: pos.left, top: pos.top, width: TIP_WIDTH }}
            >
              <strong className="invoice-list__evidence-title">How it’s calculated</strong>
              {evidence.detail.map((line) => (
                <span key={line} className="invoice-list__evidence-line">
                  {line}
                </span>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
