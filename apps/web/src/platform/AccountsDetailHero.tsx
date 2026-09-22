import { useId, type ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  mark: ReactNode;
  actions?: ReactNode;
  /** Optional status chip next to the title. */
  status?: ReactNode;
};

/** Shared Accounts-tab detail hero — matches platform detail (aura + identity + actions). */
export function AccountsDetailHero({
  eyebrow,
  title,
  subtitle,
  mark,
  actions,
  status,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const gA = `pd-hero-gold-a-${uid}`;
  const gB = `pd-hero-gold-b-${uid}`;
  const gC = `pd-hero-gold-c-${uid}`;
  const gFill = `pd-hero-gold-fill-${uid}`;

  return (
    <header className="platform-detail__hero">
      <div className="platform-detail__hero-aura" aria-hidden>
        <svg
          className="platform-detail__hero-aura-svg"
          viewBox="0 0 640 120"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gA} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,208,96,0)" />
              <stop offset="12%" stopColor="rgba(255,220,140,0.2)" />
              <stop offset="36%" stopColor="rgba(255,220,140,0.7)" />
              <stop offset="58%" stopColor="rgba(255,193,69,0.42)" />
              <stop offset="82%" stopColor="rgba(255,208,96,0.18)" />
              <stop offset="100%" stopColor="rgba(255,208,96,0)" />
            </linearGradient>
            <linearGradient id={gB} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,208,96,0)" />
              <stop offset="14%" stopColor="rgba(255,230,160,0.16)" />
              <stop offset="40%" stopColor="rgba(255,230,160,0.48)" />
              <stop offset="68%" stopColor="rgba(255,193,69,0.22)" />
              <stop offset="100%" stopColor="rgba(255,208,96,0)" />
            </linearGradient>
            <linearGradient id={gC} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,208,96,0)" />
              <stop offset="20%" stopColor="rgba(255,208,96,0.12)" />
              <stop offset="48%" stopColor="rgba(255,208,96,0.34)" />
              <stop offset="74%" stopColor="rgba(255,220,140,0.14)" />
              <stop offset="100%" stopColor="rgba(255,208,96,0)" />
            </linearGradient>
            <linearGradient id={gFill} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,208,96,0.08)" />
              <stop offset="100%" stopColor="rgba(255,208,96,0)" />
            </linearGradient>
          </defs>
          <path
            d="M40 78 C 140 74, 200 32, 300 38 C 420 46, 500 72, 620 68"
            fill="none"
            stroke={`url(#${gA})`}
            strokeWidth="1.55"
            strokeLinecap="round"
          />
          <path
            d="M60 88 C 160 84, 220 48, 320 52 C 440 58, 520 80, 600 78"
            fill="none"
            stroke={`url(#${gB})`}
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.9"
          />
          <path
            d="M50 64 C 150 60, 210 92, 320 86 C 450 78, 530 44, 630 48"
            fill="none"
            stroke={`url(#${gC})`}
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d="M90 92 C 190 88, 250 58, 360 60 C 480 62, 540 82, 600 80 L 600 110 L 90 110 Z"
            fill={`url(#${gFill})`}
            opacity="0.4"
          />
        </svg>
      </div>
      <div className="platform-detail__hero-top">
        <div className="platform-detail__hero-main">
          <div className="platform-detail__mark-wrap">{mark}</div>
          <div className="platform-detail__identity">
            <p className="platform-detail__eyebrow">{eyebrow}</p>
            <div className="platform-detail__title-row">
              <h3 className="platform-detail__title">{title}</h3>
              {status}
            </div>
            {subtitle ? (
              <p className="platform-detail__subtitle">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="platform-detail__hero-actions">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
