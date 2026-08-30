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
    let cancelled = false;
    const loadHealth = async () => {
      const next = await fetchPlatformHealth();
      if (cancelled) return;
      syncPlatformHealthAlerts(next);
      if (next === "unreachable") {
        setHealth({ api: false, database: false, webhook: false });
      } else {
        setHealth(next);
      }
    };
    void loadHealth();
    const id = window.setInterval(() => void loadHealth(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="topbar-status" aria-label="System status">
      <TopbarStatusPill label="Main-Net" title="Settlement rail" />
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
        to: "/platform",
        label: "Dashboard",
        end: true,
        Icon: DashboardNavIcon,
      },
      {
        to: "/platform/architecture",
        label: "Architecture",
        matchPrefix: "/platform/architecture",
        Icon: ArchitectureNavIcon,
      },
      {
        to: "/platform/agents",
        label: "Agents",
        matchPrefix: "/platform/agents",
        Icon: AgentsNavIcon,
      },
      {
        to: "/platform/merchants",
        label: "Merchants",
        matchPrefix: "/platform/merchants",
        Icon: MerchantsNavIcon,
      },
      {
        to: "/platform/compliance",
        label: "Compliance",
        matchPrefix: "/platform/compliance",
        Icon: ComplianceNavIcon,
      },
      {
        to: "/platform/service-bills",
        label: "Bills",
        matchPrefix: "/platform/service-bills",
        Icon: ServiceBillsNavIcon,
      },
      {
        to: "/platform/commissions",
        label: "Commissions",
        matchPrefix: "/platform/commissions",
        Icon: FeesNavIcon,
      },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      {
        to: "/platform/settings/networks",
        label: "Network",
        matchPrefix: "/platform/settings/networks",
        Icon: NetworkNavIcon,
      },
      {
        to: "/platform/ops/health",
        label: "Health",
        matchPrefix: "/platform/ops/health",
        Icon: HealthNavIcon,
      },
      {
        to: "/platform/settings/team",
        label: "Team",
        matchPrefix: "/platform/settings/team",
        Icon: TeamNavIcon,
      },
      {
        to: "/platform/settings/fee-tiers",
        label: "Fees",
        matchPrefix: "/platform/settings/fee-tiers",
        Icon: FeesNavIcon,
      },
      {
        to: "/platform/settings/billing-wallet",
        label: "Billing",
        matchPrefix: "/platform/settings/billing-wallet",
        Icon: ServiceBillsNavIcon,
      },
      {
        to: "/platform/audit",
        label: "Audit",
        matchPrefix: "/platform/audit",
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
  const { mobileNavOpen, closeMobileNav, toggleMobileNav } =
    usePortalMobileNav();

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
      className={`shell platform-shell${collapsed ? " platform-shell--collapsed" : ""}${shellEnter ? " is-enter" : ""}${mobileNavOpen ? " portal-shell--nav-open" : ""}`}
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
          <div className="logo-mark">CG</div>
          {!collapsed ? (
            <div className="logo-copy">
              <p className="logo-title">CryptoGate</p>
              <span className="logo-badge">PLATFORM</span>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            <SidebarCollapseIcon
              className="sidebar-toggle-icon"
              expanded={!collapsed}
            />
          </button>
        </div>
        <nav className="nav-list" aria-label="Platform" ref={navRef}>
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="nav-group">
              {!collapsed ? (
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
                  >
                    <Icon />
                    {!collapsed ? <span>{item.label}</span> : null}
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
            collapsed={collapsed}
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
