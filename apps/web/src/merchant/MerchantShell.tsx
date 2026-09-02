import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useMatch } from "react-router-dom";
import { AlertsDrawer } from "../platform/ui/AlertsDrawer";
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
import { GateLogoMark } from "../auth/GateLogoMark";
import { ServerConnectionStatus } from "../shared/ServerConnectionStatus";
import {
  countUnreadMerchantAlerts,
  initMerchantAlertReads,
  merchantAlertsSource,
  refreshMerchantAlerts,
  subscribeMerchantAlerts,
} from "./merchantAlerts";
import {
  locationKindLabel,
  locationKindTitle,
  primaryMerchantOrgId,
  sessionIsCashierOnly,
  sessionLocationKind,
} from "./org";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import { prefetchMerchantRoute } from "./prefetchRoutes";
import { merchantRoute } from "../shared/portalRouting";
import type { OrgAccount, Session } from "./api";

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
      { to: merchantRoute(), label: "Dashboard", end: true, Icon: DashboardNavIcon },
      {
        to: merchantRoute("orders"),
        label: "Orders",
        matchPrefix: merchantRoute("orders"),
        Icon: OrdersNavIcon,
      },
      {
        to: merchantRoute("service-bills"),
        label: "Service Bills",
        matchPrefix: merchantRoute("service-bills"),
        Icon: BillsNavIcon,
      },
      {
        to: merchantRoute("sites"),
        label: "Sites",
        matchPrefix: merchantRoute("sites"),
        Icon: SitesNavIcon,
      },
      {
        to: merchantRoute("reports"),
        label: "Reports",
        matchPrefix: merchantRoute("reports"),
        Icon: ReportsNavIcon,
      },
      {
        to: merchantRoute("networks"),
        label: "Networks",
        matchPrefix: merchantRoute("networks"),
        Icon: IntegrationsNavIcon,
      },
      {
        to: merchantRoute("settings/settlement"),
        label: "Settlement",
        matchPrefix: merchantRoute("settings/settlement"),
        Icon: SettlementNavIcon,
      },
      {
        to: merchantRoute("settings/team"),
        label: "Team",
        matchPrefix: merchantRoute("settings/team"),
        Icon: TeamNavIcon,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        to: merchantRoute("settings/integrations"),
        label: "Integrations",
        matchPrefix: merchantRoute("settings/integrations"),
        Icon: IntegrationsNavIcon,
      },
      {
        to: merchantRoute("settings/notifications"),
        label: "Alerts",
        matchPrefix: merchantRoute("settings/notifications"),
        Icon: AlertsNavIcon,
      },
    ],
  },
];

const CASHIER_GROUPS: NavGroup[] = [
  {
    label: "Cashier terminal",
    items: [
      { to: merchantRoute(), label: "Dashboard", end: true, Icon: DashboardNavIcon },
      {
        to: merchantRoute("orders"),
        label: "My Orders",
        matchPrefix: merchantRoute("orders"),
        exclude: merchantRoute("orders/new"),
        Icon: OrdersNavIcon,
      },
      {
        to: merchantRoute("orders/new"),
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
};

function navPrefetchKey(item: NavItem): string {
  return item.to.replace(/^\//, "");
}

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
}: Props) {
  const location = useLocation();
  const onOrdersNew = useMatch({ path: merchantRoute("orders/new"), end: true });
  const showCashierBanner = sessionIsCashierOnly(session) && Boolean(onOrdersNew);
  const cashier = sessionIsCashierOnly(session);
  const groups = cashier ? CASHIER_GROUPS : OWNER_GROUPS;
  const merchantId = primaryMerchantOrgId(session);
  const [orgs, setOrgs] = useState<OrgAccount[] | null>(() => peekMerchantOrgs());
  const locationKind = useMemo(
    () => sessionLocationKind(session, orgs),
    [session, orgs],
  );
  const [shellEnter, setShellEnter] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
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
    let cancelled = false;
    void getMerchantOrgs()
      .then((rows) => {
        if (!cancelled) setOrgs(rows);
      })
      .catch(() => {
        if (!cancelled) setOrgs((prev) => prev ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [session.userId]);

  useEffect(() => {
    const sync = () => setUnreadAlerts(countUnreadMerchantAlerts());
    sync();
    return subscribeMerchantAlerts(sync);
  }, [session.email]);

  useEffect(() => {
    const pageVisible = () => document.visibilityState === "visible";

    const run = async () => {
      if (!pageVisible()) return;
      await refreshMerchantAlerts(session);
    };

    void run();
    const interval = window.setInterval(() => void run(), 60_000);
    return () => window.clearInterval(interval);
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
          <GateLogoMark size={32} className="logo-mark" />
          <div className="logo-copy">
            <p className="logo-title">PaymentGate</p>
            <div className="logo-badges">
              <span className="logo-badge">
                {cashier ? "Cashier" : "Merchant"}
              </span>
              {locationKind ? (
                <span
                  className="logo-badge logo-badge--location"
                  title={locationKindTitle(locationKind)}
                >
                  {locationKindLabel(locationKind)}
                </span>
              ) : null}
            </div>
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
                    onMouseEnter={() =>
                      prefetchMerchantRoute(navPrefetchKey(item))
                    }
                    onFocus={() => prefetchMerchantRoute(navPrefetchKey(item))}
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
    </div>
  );
}
