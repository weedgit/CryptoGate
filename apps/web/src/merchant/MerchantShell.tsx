import {
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertsDrawer } from "../platform/ui/AlertsDrawer";
import { AlertsBellButton } from "../shared/AlertsBellButton";
import { MobileNavToggle } from "../shared/MobileNavToggle";
import { ThemeToggleButton } from "../shared/ThemeToggleButton";
import { TopbarSearch } from "../shared/TopbarSearch";
import { UnresolvedAlertsBanner } from "../shared/UnresolvedAlertsBanner";
import { usePortalMobileNav } from "../shared/usePortalMobileNav";
import { PortalNav, type PortalNavGroup } from "../shared/PortalNav";
import { setViewerTimeZone } from "../shared/dateTime";
import { OrgSetupModalHost } from "../auth/OrgSetupModalHost";
import {
  DashboardNavIcon,
  FeesNavIcon,
  NetworkNavIcon,
  ServiceBillsNavIcon,
  SidebarCollapseIcon,
  TeamNavIcon,
} from "../platform/NavIcons";
import {
  AlertsNavIcon,
  IntegrationsNavIcon,
  OrdersNavIcon,
  ReportsNavIcon,
  SettlementNavIcon,
  SitesNavIcon,
} from "./NavIcons";
import { SidebarProfileMenu } from "../auth/SidebarProfileMenu";
import { SidebarRoleCard } from "../shared/SidebarRoleCard";
import { OrgBrandMark } from "../shared/OrgBrandMark";
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

const SIDEBAR_KEY = "paymentgate.merchant.sidebarCollapsed";

const OWNER_GROUPS: PortalNavGroup[] = [
  {
    label: "Core systems",
    items: [
      { to: merchantRoute(), label: "Dashboard", end: true, Icon: DashboardNavIcon },
      {
        to: merchantRoute("orders"),
        label: "Invoice",
        matchPrefix: merchantRoute("orders"),
        Icon: OrdersNavIcon,
      },
      {
        to: merchantRoute("sites"),
        label: "Sites",
        matchPrefix: merchantRoute("sites"),
        Icon: SitesNavIcon,
      },
      {
        to: merchantRoute("service-bills"),
        label: "Service Bills",
        matchPrefix: merchantRoute("service-bills"),
        Icon: ServiceBillsNavIcon,
      },
      {
        to: merchantRoute("reports"),
        label: "Reports",
        matchPrefix: merchantRoute("reports"),
        Icon: ReportsNavIcon,
      },
    ],
  },
  {
    label: "Organization",
    items: [
      {
        to: merchantRoute("networks"),
        label: "Networks",
        matchPrefix: merchantRoute("networks"),
        Icon: NetworkNavIcon,
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
      {
        to: merchantRoute("settings/pricing"),
        label: "Pricing",
        matchPrefix: merchantRoute("settings/pricing"),
        Icon: FeesNavIcon,
      },
    ],
  },
];

const CASHIER_GROUPS: PortalNavGroup[] = [
  {
    label: "Cashier terminal",
    items: [
      { to: merchantRoute(), label: "Dashboard", end: true, Icon: DashboardNavIcon },
      {
        to: merchantRoute("orders"),
        label: "Invoice",
        exactActive: true,
        Icon: OrdersNavIcon,
        children: [
          {
            to: merchantRoute("orders/new"),
            label: "Create invoice",
            matchPrefix: merchantRoute("orders/new"),
          },
        ],
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

export function MerchantShell({
  session,
  children,
  onSignOut,
  onSessionRefresh,
}: Props) {
  const cashier = sessionIsCashierOnly(session);
  const merchantId = primaryMerchantOrgId(session);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [orgs, setOrgs] = useState<OrgAccount[] | null>(() => peekMerchantOrgs());
  const homeOrg = useMemo(
    () => (merchantId ? orgs?.find((o) => o.id === merchantId) ?? null : null),
    [merchantId, orgs],
  );
  const locationKind = useMemo(
    () => sessionLocationKind(session),
    [session],
  );
  const groups = useMemo(() => {
    if (cashier) return CASHIER_GROUPS;
    if (locationKind === "site") {
      return OWNER_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => item.to !== merchantRoute("sites")),
      }));
    }
    return OWNER_GROUPS;
  }, [cashier, locationKind]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const mainRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [shellEnter, setShellEnter] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const { mobileNavOpen, isTabletOrBelow, closeMobileNav, toggleMobileNav } =
    usePortalMobileNav();
  /** Drawer must show labels even if desktop preference is collapsed. */
  const navCollapsed = collapsed && !isTabletOrBelow;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShellEnter(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setViewerTimeZone(session.timezone);
  }, [session.timezone]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  /** Keep sidebar chrome fixed — wheel over aside scrolls the main pane instead. */
  const onSidebarWheel = (e: ReactWheelEvent<HTMLElement>) => {
    const nav = navRef.current;
    const main = mainRef.current;
    if (!main) return;

    if (nav) {
      const canUp = nav.scrollTop > 0;
      const canDown = nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1;
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;
      const overNav = nav.contains(e.target as Node);
      if (overNav && ((scrollingDown && canDown) || (scrollingUp && canUp))) {
        return;
      }
    }

    main.scrollTop += e.deltaY;
    e.preventDefault();
  };

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

  // Stable deps only — keep-alive setSession() must not re-arm the 60s poller.
  useEffect(() => {
    const pageVisible = () => document.visibilityState === "visible";

    const run = async () => {
      if (!pageVisible()) return;
      await refreshMerchantAlerts(sessionRef.current);
    };

    void run();
    const interval = window.setInterval(() => void run(), 60_000);
    return () => window.clearInterval(interval);
  }, [cashier, merchantId, session.userId]);

  useEffect(() => {
    if (!alertsOpen) return;
    void refreshMerchantAlerts(sessionRef.current);
  }, [alertsOpen]);

  const setupKey = `${session.setupReady}:${session.activationPaid}:${session.contactVerified}:${session.walletSet}:${session.personComplete}:${session.profileComplete}`;
  useEffect(() => {
    void refreshMerchantAlerts(sessionRef.current);
  }, [setupKey]);

  const brandName = homeOrg?.name ?? (cashier ? "Cashier" : "Merchant");
  const tagline = cashier ? "Cashier terminal" : "Merchant portal";

  return (
    <div
      className={`shell merchant-shell platform-shell${navCollapsed ? " platform-shell--collapsed" : ""}${shellEnter ? " is-enter" : ""}${mobileNavOpen ? " portal-shell--nav-open" : ""}`}
    >
      <button
        type="button"
        className="portal-nav-backdrop"
        aria-label="Close navigation"
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={closeMobileNav}
      />
      <aside
        id="portal-sidebar"
        className="sidebar"
        aria-label="Merchant navigation"
        onWheel={onSidebarWheel}
      >
        <div className="logo-row">
          <OrgBrandMark
            name={brandName}
            iconKey={homeOrg?.iconKey}
            size={64}
            className="logo-mark"
          />
          {!navCollapsed ? (
            <div className="logo-copy">
              <p className="logo-title">{brandName}</p>
              <span className="logo-tagline">{tagline}</span>
              {locationKind === "site" ? (
                <span
                  className="logo-badge logo-badge--location"
                  title={locationKindTitle(locationKind)}
                >
                  {locationKindLabel(locationKind)}
                </span>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-toggle sidebar-toggle--rail"
            aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!navCollapsed}
            title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            <SidebarCollapseIcon
              className="sidebar-toggle-icon"
              expanded={!navCollapsed}
            />
          </button>
        </div>
        <PortalNav
          groups={groups}
          collapsed={navCollapsed}
          ariaLabel="Merchant"
          prefetch={prefetchMerchantRoute}
          navRef={navRef}
        />
        <div className="sidebar-foot">
          <SidebarRoleCard session={session} portal="merchant" collapsed={navCollapsed} />
        </div>
      </aside>
      <div className="main">
        <header className="topbar topbar--chrome">
          <div className="topbar-left">
            <MobileNavToggle open={mobileNavOpen} onToggle={toggleMobileNav} />
            <div className="topbar-leading" id="platform-topbar-leading" />
          </div>
          <div className="topbar-center">
            <TopbarSearch placeholder="Search orders…" />
            <div className="topbar-center-slot" id="platform-topbar-center" />
          </div>
          <div className="topbar-right">
            <div className="topbar-actions" id="platform-topbar-actions" />
            <div className="topbar-utils" role="group" aria-label="Utilities">
              <ServerConnectionStatus />
              <AlertsBellButton
                open={alertsOpen}
                unreadCount={unreadAlerts}
                onOpen={() => setAlertsOpen(true)}
              />
              <ThemeToggleButton />
            </div>
            <span className="topbar-divider" aria-hidden />
            <SidebarProfileMenu
              session={session}
              variant="merchant"
              placement="topbar"
              onSignOut={onSignOut}
              onSessionRefresh={onSessionRefresh}
            />
          </div>
        </header>
        <div className="main__scroll" ref={mainRef}>
          <UnresolvedAlertsBanner
            source={merchantAlertsSource}
            onOpenAlerts={() => setAlertsOpen(true)}
          />
          <div className="body">
            {onSessionRefresh ? (
              <OrgSetupModalHost
                session={session}
                onSession={onSessionRefresh}
                portal="merchant"
              />
            ) : null}
            {children}
          </div>
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
