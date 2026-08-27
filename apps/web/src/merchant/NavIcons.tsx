type IconProps = {
  className?: string;
};

function NavIcon({ src, className }: IconProps & { src: string }) {
  return (
    <span
      className={`nav-item-icon${className ? ` ${className}` : ""}`}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
      }}
      aria-hidden
    />
  );
}

const ICONS = {
  home: "/icons/nav/home.svg",
  fileText: "/icons/nav/file-text.svg",
  receipt: "/icons/nav/receipt.svg",
  layers: "/icons/nav/layers.svg",
  barChart: "/icons/nav/bar-chart.svg",
  wallet: "/icons/nav/wallet.svg",
  building: "/icons/nav/building-2.svg",
  users: "/icons/nav/users-round.svg",
  settings: "/icons/nav/settings.svg",
  settings2: "/icons/nav/settings-2.svg",
  shield: "/icons/nav/shield.svg",
  bell: "/icons/nav/bell-ring.svg",
} as const;

export function DashboardNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.home} className={className} />;
}
export function OrdersNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.fileText} className={className} />;
}
export function BillsNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.receipt} className={className} />;
}
export function SitesNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.layers} className={className} />;
}
export function ReportsNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.barChart} className={className} />;
}
export function SettlementNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.wallet} className={className} />;
}
export function OrgNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.building} className={className} />;
}
export function TeamNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.users} className={className} />;
}
export function IntegrationsNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.settings2} className={className} />;
}
export function BillingNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.settings} className={className} />;
}
export function SecurityNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.shield} className={className} />;
}
export function AlertsNavIcon({ className }: IconProps) {
  return <NavIcon src={ICONS.bell} className={className} />;
}
