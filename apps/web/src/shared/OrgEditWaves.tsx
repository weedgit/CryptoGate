import { useId } from "react";

/** Gold wave art for `.org-edit__head` title bars. */
export function OrgEditWaves() {
  const uid = useId().replace(/:/g, "");
  const a = `org-edit-waves-a-${uid}`;
  const b = `org-edit-waves-b-${uid}`;
  const c = `org-edit-waves-c-${uid}`;
  return (
    <div className="org-edit__waves" aria-hidden>
      <svg viewBox="0 0 640 96" preserveAspectRatio="none">
        <defs>
          <linearGradient id={a} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
            <stop offset="18%" style={{ stopColor: "rgb(var(--gw-hi, 255 220 140) / 0.82)" }} />
            <stop offset="45%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0.52)" }} />
            <stop offset="72%" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69) / 0.24)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
          </linearGradient>
          <linearGradient id={b} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
            <stop offset="26%" style={{ stopColor: "rgb(var(--gw-hi, 255 230 160) / 0.58)" }} />
            <stop offset="55%" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69) / 0.3)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
          </linearGradient>
          <linearGradient id={c} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
            <stop offset="34%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0.4)" }} />
            <stop offset="66%" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69) / 0.16)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
          </linearGradient>
        </defs>
        <path
          d="M80 62 C 180 58, 240 30, 340 36 C 430 42, 500 56, 580 50"
          fill="none"
          stroke={`url(#${a})`}
          strokeWidth="1.55"
          strokeLinecap="round"
        />
        <path
          d="M100 74 C 200 70, 260 46, 360 50 C 450 54, 510 66, 570 62"
          fill="none"
          stroke={`url(#${b})`}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M120 50 C 210 46, 270 68, 370 62 C 460 56, 520 40, 590 44"
          fill="none"
          stroke={`url(#${c})`}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>
    </div>
  );
}
