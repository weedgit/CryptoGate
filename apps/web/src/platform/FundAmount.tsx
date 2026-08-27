import type { ReactNode } from "react";
import { formatUsd } from "./org";

type Props = {
  amount?: string | number | null;
  children?: ReactNode;
  className?: string;
};

/** Gold only for money figures ($ / settlement amounts) — not counts or word labels. */
export function FundAmount({ amount, children, className }: Props) {
  const cls = className ? `fund-amount ${className}` : "fund-amount";
  if (children != null) {
    return <span className={cls}>{children}</span>;
  }
  if (amount == null || amount === "") {
    return <span className={cls}>—</span>;
  }
  const text = typeof amount === "number" ? formatUsd(String(amount)) : formatUsd(amount);
  return <span className={cls}>{text}</span>;
}
