import type { ReactNode } from "react";

type StatusBadgeProps = {
  tone: string;
  children: ReactNode;
  /** Soft breathe — verifying */
  live?: boolean;
  /** Coral pulse ×3 — payment anomaly */
  alarm?: boolean;
  className?: string;
};

/** Figma 02 status chip. Labels come from callers (never "Paid"). */
export function StatusBadge({
  tone,
  children,
  live = false,
  alarm = false,
  className = "",
}: StatusBadgeProps) {
  const mods = [
    "status-badge",
    `tone-${tone}`,
    live ? "is-live" : "",
    alarm ? "is-alarm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={mods}>{children}</span>;
}
