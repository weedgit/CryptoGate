import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { Session } from "./api";
import { PortalNav, type PortalNavGroup } from "../shared/PortalNav";
import { AlertsNavIcon } from "../merchant/NavIcons";
import {
  ArchitectureNavIcon,
  AuditLogNavIcon,
  SupportNavIcon,
  DashboardNavIcon,
  NetworkNavIcon,
  ServiceBillsNavIcon,
  CommissionsNavIcon,
  FeesNavIcon,
  RatesNavIcon,
  SidebarCollapseIcon,
  TeamNavIcon,
} from "./NavIcons";
import { SidebarProfileMenu } from "../auth/SidebarProfileMenu";
import { SidebarRoleCard } from "../shared/SidebarRoleCard";
import { GateLogoMark } from "../auth/GateLogoMark";
import { AlertsDrawer, platformAlertsSource } from "./ui/AlertsDrawer";
import {
  countUnreadPlatformAlerts,
  subscribePlatformAlerts,
} from "./platformAlerts";
import { AlertsBellButton } from "../shared/AlertsBellButton";
import { MobileNavToggle } from "../shared/MobileNavToggle";
import { ThemeToggleButton } from "../shared/ThemeToggleButton";
import { TopbarSearch } from "../shared/TopbarSearch";
import { UnresolvedAlertsBanner } from "../shared/UnresolvedAlertsBanner";
import { usePortalMobileNav } from "../shared/usePortalMobileNav";
import { setViewerTimeZone } from "../shared/dateTime";
import {
  fetchPlatformHealth,
  syncPlatformHealthAlerts,
  type PlatformHealthSnapshot,
} from "../shared/platformHealthAlerts";
import {
  loadPlatformNotificationPrefs,
  platformInAppEnabled,
  primaryPlatformOrgId,
  subscribePlatformNotificationPrefs,
} from "./platformNotificationPrefs";
import {
  ensureHealthPolling,
  subscribeSharedHealth,
} from "../shared/healthPolling";
import { platformRoute } from "../shared/portalRouting";
import { useConditionAlerts } from "../shared/conditionAlerts";
import {
  clearPlatformConditionAlerts,
  refreshPlatformConditionAlerts,
  rerunPlatformConditionAlerts,
} from "./platformConditionAlerts";
import { prefetchPlatformRoute } from "./prefetchRoutes";

const HEALTHY: PlatformHealthSnapshot = { api: true, database: true, webhook: true };

function PlatformHealthBeacon({ orgId }: { orgId: string | null }) {
  useEffect(() => {
    let cancelled = false;
    let muted = false;
    let last: PlatformHealthSnapshot | "unreachable" | null = null;
    const apply = () => {
      if (last) syncPlatformHealthAlerts(muted ? HEALTHY : last);
    };
    const readMute = () => {
      if (!orgId) return;
      void loadPlatformNotificationPrefs(orgId)
        .then((prefs) => {
          if (cancelled) return;
          muted = !platformInAppEnabled(prefs, "platform_system_health");
          apply();
        })
        .catch(() => undefined);
    };
    ensureHealthPolling(true);
    const sync = (next: PlatformHealthSnapshot | "unreachable") => {
      last = next;
      apply();
    };
    const unsub = subscribeSharedHealth(sync);
    const unsubPrefs = subscribePlatformNotificationPrefs(() => {
      readMute();
      rerunPlatformConditionAlerts();
    });
    readMute();
    void fetchPlatformHealth().then(sync);
    return () => {
      cancelled = true;
      unsub();
      unsubPrefs();
      ensureHealthPolling(false);
    };
  }, [orgId]);
  return null;
}

const NAV_GROUPS: PortalNavGroup[] = [
  {
    label: "Core systems",
    items: [
      {
        to: platformRoute(),
        label: "Dashboard",
        end: true,
        Icon: DashboardNavIcon,
      },
      {
        to: platformRoute("invoices"),
        label: "Invoice",
        matchPrefix: platformRoute("invoices"),
        Icon: SupportNavIcon,
      },
      {
        to: platformRoute("accounts"),
        label: "Accounts",
        exactActive: true,
        matchPrefixes: [
          platformRoute("accounts"),
          platformRoute("agents"),
          platformRoute("merchants"),
          platformRoute("architecture"),
        ],
        Icon: ArchitectureNavIcon,
        children: [
          {
            to: platformRoute("accounts/agents"),
            label: "Agents",
            matchPrefix: platformRoute("accounts/agents"),
          },
          {
            to: platformRoute("accounts/merchants"),
            label: "Merchants",
            matchPrefix: platformRoute("accounts/merchants"),
          },
        ],
      },
      {
        to: platformRoute("service-bills"),
        label: "Service Bills",
        matchPrefix: platformRoute("service-bills"),
        Icon: ServiceBillsNavIcon,
      },
      {
        to: platformRoute("commissions"),
        label: "Commissions",
        matchPrefix: platformRoute("commissions"),
        Icon: CommissionsNavIcon,
      },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      {
        to: platformRoute("settings/networks"),
        label: "Network",
        matchPrefix: platformRoute("settings/networks"),
        Icon: NetworkNavIcon,
      },
      {
        to: platformRoute("settings/fee-tiers"),
        label: "Fees",
        matchPrefix: platformRoute("settings/fee-tiers"),
        Icon: FeesNavIcon,
      },
      {
        to: platformRoute("settings/rates"),
        label: "Rates",
        matchPrefix: platformRoute("settings/rates"),
        Icon: RatesNavIcon,
      },
      {
        to: platformRoute("audit"),
        label: "Audit",
        matchPrefix: platformRoute("audit"),
        Icon: AuditLogNavIcon,
      },
      {
        to: platformRoute("settings/team"),
        label: "Team",
        matchPrefix: platformRoute("settings/team"),
        Icon: TeamNavIcon,
      },
      {
        to: platformRoute("settings/notifications"),
        label: "Alerts",
        matchPrefix: platformRoute("settings/notifications"),
        Icon: AlertsNavIcon,
      },
    ],
  },
];

const SIDEBAR_KEY = "paymentgate.platform.sidebarCollapsed";

type Props = {
  session: Session;
  children: ReactNode;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
};

export function PlatformShell({
  session,
  children,
  onSignOut,
  onSessionRefresh,
}: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const mainRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  useConditionAlerts(
    session,
    refreshPlatformConditionAlerts,
    clearPlatformConditionAlerts,
    alertsOpen,
  );
  const [shellEnter, setShellEnter] = useState(false);
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
    const sync = () => setUnreadAlerts(countUnreadPlatformAlerts());
    sync();
    return subscribePlatformAlerts(sync);
  }, []);

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

  return (
    <div
      className={`shell platform-shell${navCollapsed ? " platform-shell--collapsed" : ""}${shellEnter ? " is-enter" : ""}${mobileNavOpen ? " portal-shell--nav-open" : ""}`}
    >
      <PlatformHealthBeacon orgId={primaryPlatformOrgId(session)} />
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
        aria-label="Platform navigation"
        onWheel={onSidebarWheel}
      >
        <div className="logo-row">
          <GateLogoMark size={64} className="logo-mark" />
          {!navCollapsed ? (
            <div className="logo-copy">
              <p className="logo-title">PaymentGate</p>
              <span className="logo-tagline">Powering payment</span>
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
          groups={NAV_GROUPS}
          collapsed={navCollapsed}
          ariaLabel="Platform"
          prefetch={prefetchPlatformRoute}
          navRef={navRef}
        />
        <div className="sidebar-foot">
          <SidebarRoleCard session={session} portal="platform" collapsed={navCollapsed} />
        </div>
      </aside>
      <div className="main">
        <header className="topbar topbar--chrome">
          <div className="topbar-left">
            <MobileNavToggle open={mobileNavOpen} onToggle={toggleMobileNav} />
            <div className="topbar-leading" id="platform-topbar-leading" />
          </div>
          <div className="topbar-center">
            <TopbarSearch placeholder="Search merchants, agents, accounts..." />
            <div className="topbar-center-slot" id="platform-topbar-center" />
          </div>
          <div className="topbar-right">
            <div className="topbar-actions" id="platform-topbar-actions" />
            <div className="topbar-utils" role="group" aria-label="Utilities">
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
              variant="platform"
              placement="topbar"
              onSignOut={onSignOut}
              onSessionRefresh={onSessionRefresh}
            />
          </div>
        </header>
        <div className="main__scroll" ref={mainRef}>
          <UnresolvedAlertsBanner
            source={platformAlertsSource}
            onOpenAlerts={() => setAlertsOpen(true)}
          />
          <div className="body">
            {children}
          </div>
        </div>
      </div>

      <AlertsDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        source={platformAlertsSource}
      />
    </div>
  );
}
