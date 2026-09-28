import type { ReactNode } from "react";

export type SettlementIconKind =
  | "vault"
  | "wallet"
  | "match"
  | "release"
  | "fx"
  | "shield"
  | "key";

const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

export const SETTLEMENT_ICONS: Record<SettlementIconKind, ReactNode> = {
  vault: svg(
    <>
      <path d="M3.5 9.5 12 4l8.5 5.5" />
      <path d="M5.5 10v7.5M9.5 10v7.5M14.5 10v7.5M18.5 10v7.5" />
      <path d="M3.5 20h17" />
    </>,
  ),
  wallet: svg(
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M16 13.5h.1" />
    </>,
  ),
  match: svg(
    <>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </>,
  ),
  release: svg(
    <>
      <path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9L12 3.5Z" />
      <path d="M4 7.5 12 11.5l8-4M12 11.5v9" />
    </>,
  ),
  fx: svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2.2c1.7.4 2.8 1 2.8 2.2s-1.2 2-2.8 2c-1.3 0-2.4-.5-2.9-1.4M12 6.2v1.6M12 16.2v1.6" />
    </>,
  ),
  shield: svg(
    <>
      <path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4.2" />
    </>,
  ),
  key: svg(
    <>
      <circle cx="8" cy="15" r="3.5" />
      <path d="m10.5 12.5 8-8M16 7l2 2M14 9l1.5 1.5" />
    </>,
  ),
};

type Props = {
  icon: SettlementIconKind;
  title: string;
  subtitle?: ReactNode;
  help?: ReactNode;
  children?: ReactNode;
};

/** Card header for Settlement sections: icon tile, title, subtitle, badges. */
export function SettlementSectionHead({ icon, title, subtitle, help, children }: Props) {
  return (
    <div className="plat-settings__card-head stl-head">
      <span className="stl-head__icon" aria-hidden>
        {SETTLEMENT_ICONS[icon]}
      </span>
      <div className="stl-head__copy">
        <div className="stl-head__title-row">
          <h2 className="plat-settings__card-title">{title}</h2>
          {help}
        </div>
        {subtitle ? <p className="stl-head__sub">{subtitle}</p> : null}
      </div>
      {children ? <div className="plat-settlement__head-badges">{children}</div> : null}
    </div>
  );
}
