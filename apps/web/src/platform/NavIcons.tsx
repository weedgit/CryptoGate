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

export function AgentsNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconShell>
  );
}

export function MerchantsNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M3 9 12 3l9 6" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </IconShell>
  );
}

export function ArchitectureNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M12 7v4" />
      <path d="M7.5 15.5 10 11" />
      <path d="M16.5 15.5 14 11" />
    </IconShell>
  );
}

export function ComplianceNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </IconShell>
  );
}

export function FeesNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5c-.4-1-1.4-1.5-2.5-1.5h-.2c-1.4 0-2.5.9-2.5 2.2 0 1.2.8 1.8 2.4 2.2l.8.2c1.4.4 2.1.9 2.1 2.1 0 1.3-1.1 2.3-2.6 2.3h-.2c-1.2 0-2.2-.6-2.6-1.6" />
      <path d="M12 6.5v1.5M12 16v1.5" />
    </IconShell>
  );
}

export function ServiceBillsNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </IconShell>
  );
}

export function NetworkNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="6" cy="7" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
      <path d="M8 7h8" />
      <path d="M7.2 8.6 10.8 15" />
      <path d="M16.8 8.6 13.2 15" />
    </IconShell>
  );
}

export function HealthNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
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

export function SettingsNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
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

export function AuditLogNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M8 4h9a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" />
      <path d="M10 9h6M10 13h6M10 17h3" />
    </IconShell>
  );
}

export function SignOutNavIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconShell>
  );
}

/** Compact chevrons for sidebar collapse / expand. */
export function SidebarCollapseIcon({
  className,
  expanded,
}: IconProps & { expanded: boolean }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {expanded ? (
        <>
          <polyline points="11 17 6 12 11 7" />
          <polyline points="18 17 13 12 18 7" />
        </>
      ) : (
        <>
          <polyline points="13 17 18 12 13 7" />
          <polyline points="6 17 11 12 6 7" />
        </>
      )}
    </svg>
  );
}
