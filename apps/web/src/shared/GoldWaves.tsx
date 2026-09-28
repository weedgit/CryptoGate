/** Decorative gold wave lines used in page / modal headers. */
export function GoldWaves({ id, className }: { id: string; className?: string }) {
  return (
    <div className={className} aria-hidden>
      <svg viewBox="0 0 640 120" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0" />
            <stop offset="0.35" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0.9" />
            <stop offset="1" style={{ stopColor: "rgb(var(--gw-base, 255 208 96))" }} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0" />
            <stop offset="0.5" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0.7" />
            <stop offset="1" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69))" }} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
          stroke={`url(#${id}-a)`}
          strokeWidth="1.55"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
          stroke={`url(#${id}-b)`}
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
          stroke={`url(#${id}-b)`}
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </div>
  );
}
