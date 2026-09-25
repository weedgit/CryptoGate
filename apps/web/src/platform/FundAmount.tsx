import type { ReactNode } from "react";
import { formatUsd, formatUsdCode } from "./org";

type Props = {
  amount?: string | number | null;
  children?: ReactNode;
  className?: string;
  /** `code` → `840.00 USD`; default `symbol` → `$840.00`. */
  unit?: "symbol" | "code";
};

/** Gold only for money figures ($ / settlement amounts) — not counts or word labels. */
export function FundAmount({ amount, children, className, unit = "symbol" }: Props) {
  const cls = className ? `fund-amount ${className}` : "fund-amount";
  if (children != null) {
    return <span className={cls}>{children}</span>;
  }
  if (amount == null || amount === "") {
    return <span className={cls}>—</span>;
  }
  const raw = typeof amount === "number" ? String(amount) : amount;
  const text = unit === "code" ? formatUsdCode(raw) : formatUsd(raw);
  return <span className={cls}>{text}</span>;
}
