import { zoneAbbrev } from "../../shared/dateTime";
import { useViewerTimeZone } from "../../shared/useViewerTimeZone";

type PeriodOption<Id extends string> = { id: Id; label: string };

type PeriodControlsProps<Id extends string> = {
  options: PeriodOption<Id>[];
  period: Id | "custom";
  startDate: string;
  endDate: string;
  onPeriodSelect: (id: Id) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  disabled?: boolean;
  refreshTitle?: string;
};

export function DashPeriodControls<Id extends string>({
  options,
  period,
  startDate,
  endDate,
  onPeriodSelect,
  onStartDateChange,
  onEndDateChange,
  onRefresh,
  refreshing,
  disabled,
  refreshTitle = "Refresh dashboard",
}: PeriodControlsProps<Id>) {
  const tz = useViewerTimeZone();
  return (
    <div className="pg-dash__period" aria-label="Period">
      <div className="pg-dash__period-pills" role="group" aria-label="Quick periods">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`pg-dash__period-pill${period === opt.id ? " is-active" : ""}`}
            onClick={() => onPeriodSelect(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="pg-dash__period-dates" aria-label="Date range">
        <label className="pg-dash__period-date">
          <span className="sr-only">Start</span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => onStartDateChange(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
        <span className="pg-dash__period-sep" aria-hidden>
          –
        </span>
        <label className="pg-dash__period-date">
          <span className="sr-only">End</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => onEndDateChange(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
      </div>
      <span
        className="pg-dash__period-zone"
        title={`Days, "Today" and MTD follow your profile time zone (${tz}). Change it in Profile.`}
      >
        {zoneAbbrev(tz)}
      </span>
      <button
        type="button"
        className="pg-dash__period-refresh"
        onClick={onRefresh}
        disabled={disabled}
        aria-label="Refresh dashboard"
        title={refreshTitle}
      >
        {refreshing ? "…" : "↻"}
      </button>
    </div>
  );
}

export function DashHeroHighlights() {
  return (
    <ul className="pg-dash__hero-highlights" aria-label="Platform highlights">
      <li className="pg-dash__hero-highlight" data-tone="blue">
        <span className="pg-dash__hero-highlight-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M3.75 12h16.5M12 3.75c2.4 2.6 3.6 5.4 3.6 8.25S14.4 17.65 12 20.25C9.6 17.65 8.4 14.85 8.4 12S9.6 6.35 12 3.75Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="pg-dash__hero-highlight-copy">
          <span className="pg-dash__hero-highlight-title">Global network</span>
          <span className="pg-dash__hero-highlight-sub">Trusted infrastructure</span>
        </span>
      </li>
      <li className="pg-dash__hero-highlight" data-tone="teal">
        <span className="pg-dash__hero-highlight-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3.6 20.1 8.1v7.8L12 20.4 3.9 15.9V8.1L12 3.6Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M12 12.15 20.1 8.1M12 12.15 3.9 8.1M12 12.15V20.4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="pg-dash__hero-highlight-copy">
          <span className="pg-dash__hero-highlight-title">Secure &amp; compliant</span>
          <span className="pg-dash__hero-highlight-sub">Built for growth</span>
        </span>
      </li>
      <li className="pg-dash__hero-highlight" data-tone="blue">
        <span className="pg-dash__hero-highlight-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4.5 16.5V19.5M9.5 12.5V19.5M14.5 9.5V19.5M19.5 5.5V19.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M4.2 11.2 10.3 6.8l4.1 3.1 5.4-6.2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="pg-dash__hero-highlight-copy">
          <span className="pg-dash__hero-highlight-title">Real-time insights</span>
          <span className="pg-dash__hero-highlight-sub">Your payments, in control</span>
        </span>
      </li>
    </ul>
  );
}

export function DashHeroAura() {
  return (
    <div className="pg-dash__hero-aura" aria-hidden>
      <svg className="pg-dash__hero-aura-svg" viewBox="0 0 640 160" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pg-hero-gold-a" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
            <stop offset="20%" style={{ stopColor: "rgb(var(--gw-hi, 255 220 140) / 0.62)" }} />
            <stop offset="52%" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69) / 0.38)" }} />
            <stop offset="80%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0.2)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
          </linearGradient>
          <linearGradient id="pg-hero-gold-b" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
            <stop offset="16%" style={{ stopColor: "rgb(var(--gw-hi, 255 230 160) / 0.42)" }} />
            <stop offset="48%" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69) / 0.22)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
          </linearGradient>
          <linearGradient id="pg-hero-gold-fill" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0.12)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--gw-base, 255 208 96) / 0)" }} />
          </linearGradient>
          <radialGradient id="pg-hero-dot-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--gw-hi, 255 230 160) / 0.95)" }} />
            <stop offset="55%" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69) / 0.45)" }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--gw-deep, 255 193 69) / 0)" }} />
          </radialGradient>
        </defs>
        <path
          d="M20 118 C 140 118, 200 42, 320 48 C 440 54, 500 108, 620 102"
          fill="none"
          stroke="url(#pg-hero-gold-a)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M40 128 C 160 124, 220 68, 340 72 C 460 76, 520 120, 600 116"
          fill="none"
          stroke="url(#pg-hero-gold-b)"
          strokeWidth="1.15"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M60 132 C 180 128, 240 86, 360 88 C 480 90, 530 122, 580 120 L 580 148 L 60 148 Z"
          fill="url(#pg-hero-gold-fill)"
          opacity="0.55"
        />
        <g className="pg-dash__hero-dots" style={{ fill: "rgb(var(--gw-base, 255 208 96))" }}>
          <circle cx="212" cy="58" r="0.85" opacity="0.4" />
          <circle cx="248" cy="44" r="1.2" opacity="0.58" />
          <circle cx="336" cy="52" r="1.1" opacity="0.52" />
          <circle cx="392" cy="58" r="0.8" opacity="0.38" />
          <circle cx="448" cy="72" r="1.15" opacity="0.48" />
          <circle cx="498" cy="96" r="0.9" opacity="0.36" />
          <circle cx="542" cy="108" r="1" opacity="0.44" />
          <circle cx="268" cy="78" r="0.9" opacity="0.32" />
          <circle cx="420" cy="64" r="0.95" opacity="0.4" />
          <circle cx="520" cy="112" r="1.05" opacity="0.36" />
          <circle cx="230" cy="52" r="1.8" fill="url(#pg-hero-dot-glow)" opacity="0.5" />
          <circle cx="410" cy="60" r="1.55" fill="url(#pg-hero-dot-glow)" opacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
