import { useEffect, useRef, useState } from "react";
import { defaultCommissionPeriodKey } from "../../commercial/commissionPayoutRecords";

function formatMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return ym || "Select month";
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return ym;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function parseYearMonth(ym: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

function utcMonthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function CommissionPeriodPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const parsed = parseYearMonth(value);
  const [viewYear, setViewYear] = useState(
    () => parsed?.year ?? new Date().getUTCFullYear(),
  );

  useEffect(() => {
    if (!open) return;
    setViewYear(parsed?.year ?? new Date().getUTCFullYear());
  }, [open, parsed?.year]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="plat-commissions__period-picker">
      <button
        type="button"
        className={`plat-commissions__period-field${open ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Invoice billing period"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="plat-commissions__period-icon" aria-hidden>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
            <rect
              x="2.25"
              y="3.25"
              width="11.5"
              height="10.5"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.35"
            />
            <path
              d="M2.25 6.75h11.5M5.25 2v2.75M10.75 2v2.75"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="plat-commissions__period-text">
          <span className="plat-commissions__period-eyebrow">Period</span>
          <span className="plat-commissions__period-label">
            {formatMonthLabel(value)}
          </span>
        </span>
        <span className="plat-commissions__period-chevron" aria-hidden>
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
            <path
              d="M2.75 4.5L6 7.75L9.25 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open ? (
        <div
          className="plat-commissions__period-menu"
          role="dialog"
          aria-label="Choose billing period"
        >
          <div className="plat-commissions__period-menu-head">
            <button
              type="button"
              className="plat-commissions__period-year-btn"
              aria-label="Previous year"
              onClick={() => setViewYear((y) => y - 1)}
            >
              ‹
            </button>
            <span className="plat-commissions__period-year">{viewYear}</span>
            <button
              type="button"
              className="plat-commissions__period-year-btn"
              aria-label="Next year"
              onClick={() => setViewYear((y) => y + 1)}
            >
              ›
            </button>
          </div>
          <div className="plat-commissions__period-months" role="listbox">
            {MONTH_SHORT.map((label, index) => {
              const month = index + 1;
              const ym = `${viewYear}-${String(month).padStart(2, "0")}`;
              const selected = ym === value;
              return (
                <button
                  key={ym}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`plat-commissions__period-month${
                    selected ? " is-selected" : ""
                  }`}
                  onClick={() => {
                    onChange(ym);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="plat-commissions__period-menu-foot">
            <button
              type="button"
              className="plat-commissions__period-foot-btn"
              onClick={() => {
                onChange(defaultCommissionPeriodKey());
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="plat-commissions__period-foot-btn"
              onClick={() => {
                onChange(utcMonthKey());
                setOpen(false);
              }}
            >
              This month
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
