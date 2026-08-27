import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { getOrg, type Session } from "./api";
import { CashierRestrictedBanner } from "./CashierRestrictedBanner";
import {
  AlertsNavIcon,
  BillsNavIcon,
  BillingNavIcon,
  DashboardNavIcon,
  IntegrationsNavIcon,
  OrdersNavIcon,
  OrgNavIcon,
  ReportsNavIcon,
  SettlementNavIcon,
  SitesNavIcon,
  TeamNavIcon,
} from "./NavIcons";
import { SidebarProfileMenu } from "../auth/SidebarProfileMenu";
import { primaryMerchantOrgId, sessionIsCashierOnly } from "./org";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  matchPrefix?: string;
  exclude?: string;
  Icon: ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const OWNER_GROUPS: NavGroup[] = [
  {
    label: "Portal controls",
    items: [
      { to: "/merchant", label: "Dashboard", end: true, Icon: DashboardNavIcon },
      {
        to: "/merchant/orders",
        label: "Orders",
        matchPrefix: "/merchant/orders",
        Icon: OrdersNavIcon,
      },
      {
        to: "/merchant/service-bills",
        label: "Service Bills",
        matchPrefix: "/merchant/service-bills",
        Icon: BillsNavIcon,
      },
      {
        to: "/merchant/sites",
        label: "Sites",
        matchPrefix: "/merchant/sites",
        Icon: SitesNavIcon,
      },
      {
        to: "/merchant/reports",
        label: "Reports",
        matchPrefix: "/merchant/reports",
        Icon: ReportsNavIcon,
      },
      {
        to: "/merchant/settings/settlement",
        label: "Settlement",
        matchPrefix: "/merchant/settings/settlement",
        Icon: SettlementNavIcon,
      },
      {
        to: "/merchant/settings/organization",
        label: "Org",
        matchPrefix: "/merchant/settings/organization",
        Icon: OrgNavIcon,
      },
      {
        to: "/merchant/settings/team",
        label: "Team",
        matchPrefix: "/merchant/settings/team",
        Icon: TeamNavIcon,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        to: "/merchant/settings/integrations",
        label: "Integrations",
        matchPrefix: "/merchant/settings/integrations",
        Icon: IntegrationsNavIcon,
      },
      {
        to: "/merchant/settings/billing",
        label: "Billing",
        matchPrefix: "/merchant/settings/billing",
        Icon: BillingNavIcon,
      },
      {
        to: "/merchant/settings/notifications",
        label: "Alerts",
        matchPrefix: "/merchant/settings/notifications",
        Icon: AlertsNavIcon,
      },
    ],
  },
];

const CASHIER_GROUPS: NavGroup[] = [
  {
    label: "Cashier terminal",
    items: [
      { to: "/merchant", label: "Dashboard", end: true, Icon: DashboardNavIcon },
      {
        to: "/merchant/orders",
        label: "My Orders",
        matchPrefix: "/merchant/orders",
        exclude: "/merchant/orders/new",
        Icon: OrdersNavIcon,
      },
      {
        to: "/merchant/orders/new",
        label: "Create Order",
        Icon: OrdersNavIcon,
      },
    ],
  },
];

type Props = {
  session: Session;
  crumb: string;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
  showCashierBanner?: boolean;
  siteLabel?: string | null;
};

function navItemClass(
  pathname: string,
  item: NavItem,
  isActive: boolean,
): string {
  const prefixActive =
    item.matchPrefix != null &&
    pathname.startsWith(item.matchPrefix) &&
    !(item.exclude && pathname.startsWith(item.exclude));
  const active = isActive || prefixActive;
  return `nav-item${active ? " active" : ""}`;
}

export function MerchantShell({
  session,
  crumb,
  children,
  onSignOut,
  onSessionRefresh,
  showCashierBanner = false,
  siteLabel = null,
}: Props) {
  const location = useLocation();
  const cashier = sessionIsCashierOnly(session);
  const groups = cashier ? CASHIER_GROUPS : OWNER_GROUPS;
  const merchantId = primaryMerchantOrgId(session);
  const [resolvedSite, setResolvedSite] = useState<string | null>(siteLabel);

  useEffect(() => {
    if (siteLabel) {
      setResolvedSite(siteLabel);
      return;
    }
    if (!merchantId || cashier) {
      setResolvedSite(null);
      return;
    }
    let cancelled = false;
    getOrg(merchantId)
      .then((org) => {
        if (!cancelled) setResolvedSite(org.name);
      })
      .catch(() => {
        if (!cancelled) setResolvedSite(null);
      });
    return () => {
      cancelled = true;
    };
  }, [siteLabel, merchantId, cashier]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo-row">
          <div className="logo-mark">CG</div>
          <div>
            <p className="logo-title">CryptoGate</p>
            <span className="logo-badge">
              {cashier ? "CASHIER PORTAL" : "OWNER PORTAL"}
            </span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Merchant">
          {groups.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => {
                const { Icon } = item;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) =>
                      navItemClass(location.pathname, item, isActive)
                    }
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>
            MERCH_ID //{" "}
            {merchantId ? merchantId.slice(0, 8).toUpperCase() : "—"}
          </p>
          <p>{cashier ? "Cashier session active" : "Enterprise tier active"}</p>
          <SidebarProfileMenu
            session={session}
            variant="merchant"
            onSignOut={onSignOut}
            onSessionRefresh={onSessionRefresh}
          />
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            {!cashier && resolvedSite ? (
              <div className="site-selector" title={resolvedSite}>
                <span>{resolvedSite}</span>
              </div>
            ) : null}
          </div>
          <div className="topbar-right">
            <span className="net-pill">MAINNET ACTIVE</span>
            {!cashier ? (
              <Link
                to="/merchant/settings/notifications"
                className="alerts-bell"
                aria-label="Alerts"
                title="Alerts"
              >
                <span
                  className="alerts-bell-icon"
                  style={{
                    WebkitMaskImage: "url(/icons/nav/bell-ring.svg)",
                    maskImage: "url(/icons/nav/bell-ring.svg)",
                  }}
                  aria-hidden
                />
              </Link>
            ) : null}
            <div className="profile">
              <strong>{session.email.split("@")[0]}</strong>
              <span>{cashier ? "Terminal Operator" : "Merchant Executive"}</span>
            </div>
          </div>
        </header>
        <div className="body">
          <div className="crumb">
            {cashier ? "Cashier Terminal" : "Merchant Terminal"} /{" "}
            <span className="here">{crumb}</span>
          </div>
          {cashier && showCashierBanner ? <CashierRestrictedBanner /> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
