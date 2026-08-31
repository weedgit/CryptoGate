import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AlertsDrawer } from "../platform/ui/AlertsDrawer";
import { AlertSummaryToast } from "../shared/AlertSummaryToast";
import { AlertsBellButton } from "../shared/AlertsBellButton";
import { MobileNavToggle } from "../shared/MobileNavToggle";
import { UnresolvedAlertsBanner } from "../shared/UnresolvedAlertsBanner";
import { usePortalMobileNav } from "../shared/usePortalMobileNav";
import { CashierRestrictedBanner } from "./CashierRestrictedBanner";
import {
  AlertsNavIcon,
  BillsNavIcon,
  DashboardNavIcon,
  IntegrationsNavIcon,
  OrdersNavIcon,
  ReportsNavIcon,
  SettlementNavIcon,
  SitesNavIcon,
  TeamNavIcon,
} from "./NavIcons";
import { SidebarProfileMenu } from "../auth/SidebarProfileMenu";
import { ServerConnectionStatus } from "../shared/ServerConnectionStatus";
import {
  countUnreadMerchantAlerts,
  initMerchantAlertReads,
  merchantAlertsSource,
  merchantAlertsToastKey,
  merchantAlertsToastMessage,
  refreshMerchantAlerts,
  subscribeMerchantAlerts,
} from "./merchantAlerts";
import { primaryMerchantOrgId, sessionIsCashierOnly } from "./org";
import type { Session } from "./api";

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
        to: "/merchant/networks",
        label: "Networks",
        matchPrefix: "/merchant/networks",
        Icon: IntegrationsNavIcon,
      },
      {
        to: "/merchant/settings/settlement",
        label: "Settlement",
        matchPrefix: "/merchant/settings/settlement",
        Icon: SettlementNavIcon,
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
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
  showCashierBanner?: boolean;
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
  children,
  onSignOut,
  onSessionRefresh,
  showCashierBanner = false,
}: Props) {
  const location = useLocation();
  const cashier = sessionIsCashierOnly(session);
  const groups = cashier ? CASHIER_GROUPS : OWNER_GROUPS;
  const merchantId = primaryMerchantOrgId(session);
  const [shellEnter, setShellEnter] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertToast, setAlertToast] = useState<string | null>(null);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const { mobileNavOpen, closeMobileNav, toggleMobileNav } =
    usePortalMobileNav();

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShellEnter(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    initMerchantAlertReads(session.email);
  }, [session.email]);

  useEffect(() => {
    const sync = () => setUnreadAlerts(countUnreadMerchantAlerts());
    sync();
    return subscribeMerchantAlerts(sync);
  }, [session.email]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { urgentUnread } = await refreshMerchantAlerts(session);
      if (cancelled || urgentUnread <= 0) return;
      const toastKey = merchantAlertsToastKey(session.email);
      if (sessionStorage.getItem(toastKey)) return;
      sessionStorage.setItem(toastKey, "1");
      setAlertToast(merchantAlertsToastMessage(urgentUnread));
    };

    void run();
    const interval = window.setInterval(() => void run(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cashier, merchantId, session]);

  useEffect(() => {
    if (!alertsOpen) return;
    void refreshMerchantAlerts(session);
  }, [alertsOpen, session]);

  return (
    <div
      className={`shell merchant-shell platform-shell${shellEnter ? " is-enter" : ""}${mobileNavOpen ? " portal-shell--nav-open" : ""}`}
    >
      <button
        type="button"
        className="portal-nav-backdrop"
        aria-label="Close navigation"
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={closeMobileNav}
      />
      <aside id="portal-sidebar" className="sidebar" aria-label="Merchant navigation">
        <div className="logo-row">
          <div className="logo-mark">CG</div>
          <div className="logo-copy">
            <p className="logo-title">CryptoGate</p>
            <span className="logo-badge">
              {cashier ? "Cashier" : "Merchant"}
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
            <MobileNavToggle open={mobileNavOpen} onToggle={toggleMobileNav} />
            <ServerConnectionStatus />
          </div>
          <div className="topbar-center" id="merchant-topbar-center" />
          <div className="topbar-right">
            <div className="topbar-actions" id="merchant-topbar-actions" />
            <AlertsBellButton
              open={alertsOpen}
              unreadCount={unreadAlerts}
              onOpen={() => setAlertsOpen(true)}
            />
          </div>
        </header>
        <UnresolvedAlertsBanner
          source={merchantAlertsSource}
          onOpenAlerts={() => setAlertsOpen(true)}
        />
        <div className="body">
          {cashier && showCashierBanner ? <CashierRestrictedBanner /> : null}
          {children}
        </div>
      </div>
      <AlertsDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        source={merchantAlertsSource}
      />
      <AlertSummaryToast
        message={alertToast}
        onOpen={() => {
          setAlertToast(null);
          setAlertsOpen(true);
        }}
        onDismiss={() => setAlertToast(null)}
      />
    </div>
  );
}
