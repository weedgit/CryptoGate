import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

function IconShell({
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={`nav-item-icon${className ? ` ${className}` : ""}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function DashboardNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </IconShell>
  );
}

export function OrdersNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </IconShell>
  );
}

export function BillsNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </IconShell>
  );
}

export function SitesNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </IconShell>
  );
}

export function ReportsNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </IconShell>
  );
}

export function SettlementNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </IconShell>
  );
}

export function OrgNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </IconShell>
  );
}

export function TeamNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M19 4v4M21 6h-4" />
    </IconShell>
  );
}

export function IntegrationsNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </IconShell>
  );
}

export function BillingNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5c-.4-1-1.4-1.5-2.5-1.5h-.2c-1.4 0-2.5.9-2.5 2.2 0 1.2.8 1.8 2.4 2.2l.8.2c1.4.4 2.1.9 2.1 2.1 0 1.3-1.1 2.3-2.6 2.3h-.2c-1.2 0-2.2-.6-2.6-1.6" />
      <path d="M12 6.5v1.5M12 16v1.5" />
    </IconShell>
  );
}

export function SecurityNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M12 3 5 6v5c0 4.5 2.9 8.1 7 9.5 4.1-1.4 7-5 7-9.5V6l-7-3Z" />
      <path d="M9.5 12.2 11.2 14l3.5-3.8" />
    </IconShell>
  );
}

export function AlertsNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </IconShell>
  );
}
