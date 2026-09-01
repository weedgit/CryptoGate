import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  type CSSProperties,
} from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Session } from "./api";
import {
  AgentsNavIcon,
  ArchitectureNavIcon,
  AuditLogNavIcon,
  ComplianceNavIcon,
  DashboardNavIcon,
  HealthNavIcon,
  MerchantsNavIcon,
  NetworkNavIcon,
  ServiceBillsNavIcon,
  FeesNavIcon,
  SidebarCollapseIcon,
  TeamNavIcon,
} from "./NavIcons";
import { SidebarProfileMenu } from "../auth/SidebarProfileMenu";
import { GateLogoMark } from "../auth/GateLogoMark";
import { chainEnvironmentLabel } from "../shared/assetNetworks";
import { sessionIsPlatformViewerOnly } from "./org";
import { AlertsDrawer, platformAlertsSource } from "./ui/AlertsDrawer";
import {
  countUnreadPlatformAlerts,
  subscribePlatformAlerts,
} from "./platformAlerts";
import { AlertsBellButton } from "../shared/AlertsBellButton";
import { MobileNavToggle } from "../shared/MobileNavToggle";
import { UnresolvedAlertsBanner } from "../shared/UnresolvedAlertsBanner";
import { usePortalMobileNav } from "../shared/usePortalMobileNav";
import {
  fetchPlatformHealth,
  syncPlatformHealthAlerts,
} from "../shared/platformHealthAlerts";
import {
  ensureHealthPolling,
  subscribeSharedHealth,
} from "../shared/healthPolling";
import { platformRoute } from "../shared/portalRouting";
import { prefetchPlatformRoute } from "./prefetchRoutes";

function TopbarStatusPill({
  label,
  title,
  ok = true,
}: {
  label: string;
  title?: string;
  ok?: boolean;
}) {
  return (
    <span
      className={`net-indicator topbar-status__pill${ok ? "" : " is-warn"}`}
      title={title}
    >
      <span
        className={`net-indicator-dot${ok ? "" : " is-warn"}`}
        aria-hidden
      />
      {label}
    </span>
  );
}

function TopbarStatusRail() {
  const [health, setHealth] = useState({
    api: true,
    database: true,
    webhook: true,
  });

  useEffect(() => {
    ensureHealthPolling(true);
    const sync = (next: Awaited<ReturnType<typeof fetchPlatformHealth>>) => {
      syncPlatformHealthAlerts(next);
      if (next === "unreachable") {
        setHealth({ api: false, database: false, webhook: false });
      } else {
        setHealth(next);
      }
    };
    const unsub = subscribeSharedHealth(sync);
    void fetchPlatformHealth().then(sync);
    return () => {
      unsub();
      ensureHealthPolling(false);
    };
  }, []);

  const chainLabel = chainEnvironmentLabel();

  return (
    <div className="topbar-status" aria-label="System status">
      <TopbarStatusPill
        label={chainLabel}
        title={`Settlement rail · ${chainLabel}`}
      />
      <TopbarStatusPill label="API" title="API process" ok={health.api} />
      <TopbarStatusPill
        label="Database"
        title="Postgres"
        ok={health.database}
      />
      <TopbarStatusPill
        label="Webhook"
        title="Webhook delivery worker"
        ok={health.webhook}
      />
    </div>
  );
}

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  matchPrefix?: string;
  Icon: ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
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
        to: platformRoute("architecture"),
        label: "Architecture",
        matchPrefix: platformRoute("architecture"),
        Icon: ArchitectureNavIcon,
      },
      {
        to: platformRoute("agents"),
        label: "Agents",
        matchPrefix: platformRoute("agents"),
        Icon: AgentsNavIcon,
      },
      {
        to: platformRoute("merchants"),
        label: "Merchants",
        matchPrefix: platformRoute("merchants"),
        Icon: MerchantsNavIcon,
      },
      {
        to: platformRoute("compliance"),
        label: "Compliance",
        matchPrefix: platformRoute("compliance"),
        Icon: ComplianceNavIcon,
      },
      {
        to: platformRoute("service-bills"),
        label: "Bills",
        matchPrefix: platformRoute("service-bills"),
        Icon: ServiceBillsNavIcon,
      },
      {
        to: platformRoute("commissions"),
        label: "Commissions",
        matchPrefix: platformRoute("commissions"),
        Icon: FeesNavIcon,
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
        to: platformRoute("ops/health"),
        label: "Health",
        matchPrefix: platformRoute("ops/health"),
        Icon: HealthNavIcon,
      },
      {
        to: platformRoute("settings/team"),
        label: "Team",
        matchPrefix: platformRoute("settings/team"),
        Icon: TeamNavIcon,
      },
      {
        to: platformRoute("settings/fee-tiers"),
        label: "Fees",
        matchPrefix: platformRoute("settings/fee-tiers"),
        Icon: FeesNavIcon,
      },
      {
        to: platformRoute("audit"),
        label: "Audit",
        matchPrefix: platformRoute("audit"),
        Icon: AuditLogNavIcon,
      },
    ],
  },
];

const SIDEBAR_KEY = "cryptogate.platform.sidebarCollapsed";

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
    item.matchPrefix != null && pathname.startsWith(item.matchPrefix);
  const active = isActive || prefixActive;
  return `nav-item${active ? " active" : ""}`;
}

export function PlatformShell({
  session,
  children,
  onSignOut,
  onSessionRefresh,
}: Props) {
  const location = useLocation();
  const readOnly = sessionIsPlatformViewerOnly(session);
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

  let navDelayIndex = 0;

  return (
    <div
      className={`shell platform-shell${navCollapsed ? " platform-shell--collapsed" : ""}${shellEnter ? " is-enter" : ""}${mobileNavOpen ? " portal-shell--nav-open" : ""}`}
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
        aria-label="Platform navigation"
        onWheel={onSidebarWheel}
      >
        <div className="logo-row">
          <GateLogoMark size={32} className="logo-mark" />
          {!navCollapsed ? (
            <div className="logo-copy">
              <p className="logo-title">CryptoGate</p>
              <span className="logo-badge">PLATFORM</span>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-toggle"
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
        <nav className="nav-list" aria-label="Platform" ref={navRef}>
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="nav-group">
              {!navCollapsed ? (
                <p
                  className="nav-label"
                  style={
                    {
                      "--nav-delay": `${80 + groupIndex * 300}ms`,
                    } as CSSProperties
                  }
                >
                  {group.label}
                </p>
              ) : null}
              {group.items.map((item) => {
                const { Icon } = item;
                const delayMs = 120 + navDelayIndex * 38;
                navDelayIndex += 1;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? false}
                    title={item.label}
                    aria-label={item.label}
                    style={{ "--nav-delay": `${delayMs}ms` } as CSSProperties}
                    className={({ isActive }) =>
                      navItemClass(location.pathname, item, isActive)
                    }
                    onMouseEnter={() => prefetchPlatformRoute(navPrefetchKey(item))}
                    onFocus={() => prefetchPlatformRoute(navPrefetchKey(item))}
                  >
                    <Icon />
                    {!navCollapsed ? <span>{item.label}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <SidebarProfileMenu
            session={session}
            variant="platform"
            collapsed={navCollapsed}
            onSignOut={onSignOut}
            onSessionRefresh={onSessionRefresh}
          />
        </div>
      </aside>
      <div className="main" ref={mainRef}>
        <header className="topbar">
          <div className="topbar-left">
            <MobileNavToggle open={mobileNavOpen} onToggle={toggleMobileNav} />
            <div className="topbar-leading" id="platform-topbar-leading" />
            <TopbarStatusRail />
          </div>
          <div className="topbar-center" id="platform-topbar-center" />
          <div className="topbar-right">
            <div className="topbar-actions" id="platform-topbar-actions" />
            <AlertsBellButton
              open={alertsOpen}
              unreadCount={unreadAlerts}
              onOpen={() => setAlertsOpen(true)}
            />
          </div>
        </header>
        <UnresolvedAlertsBanner
          source={platformAlertsSource}
          onOpenAlerts={() => setAlertsOpen(true)}
        />
        <div className="body">
          {readOnly ? (
            <div className="banner banner-warn" style={{ marginBottom: 16 }}>
              Read-only mode — Viewer accounts cannot issue bills or change
              settings.
            </div>
          ) : null}
          {children}
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
