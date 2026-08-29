type Props = {
  size?: number;
  className?: string;
};

/** Geometric gate mark — Institutional Ink & Teal (UI-Style-Lock). */
export function GateLogoMark({ size = 36, className = "" }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="36" height="36" rx="6" fill="var(--teal, #00d4c8)" />
      <rect x="7" y="6" width="7" height="24" rx="1.5" fill="var(--bg, #0b0f14)" />
      <rect x="22" y="6" width="7" height="24" rx="1.5" fill="var(--bg, #0b0f14)" />
      <rect x="14" y="14" width="8" height="8" rx="1" fill="var(--bg, #0b0f14)" />
    </svg>
  );
}
