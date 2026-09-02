import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Session } from "./api";
import { SidebarProfileMenu } from "../auth/SidebarProfileMenu";
import { GateLogoMark } from "../auth/GateLogoMark";
import {
  AgentsNavIcon,
  ArchitectureNavIcon,
  DashboardNavIcon,
  FeesNavIcon,
  MerchantsNavIcon,
  ServiceBillsNavIcon,
  SettingsNavIcon,
  SidebarCollapseIcon,
  TeamNavIcon,
} from "../platform/NavIcons";
import { AlertsDrawer, platformAlertsSource } from "../platform/ui/AlertsDrawer";
import {
  countUnreadPlatformAlerts,
  subscribePlatformAlerts,
} from "../platform/platformAlerts";
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
import { ServerConnectionStatus } from "../shared/ServerConnectionStatus";
import { sessionIsAgentViewerOnly } from "./org";
import { agentRoute } from "../shared/portalRouting";
import { prefetchAgentRoute } from "./prefetchRoutes";

const SIDEBAR_KEY = "paymentgate.agent.sidebarCollapsed";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  matchPrefix?: string;
  Icon: ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { to: agentRoute(), label: "Dashboard", end: true, Icon: DashboardNavIcon },
  {
    to: agentRoute("architecture"),
    label: "Architecture",
    matchPrefix: agentRoute("architecture"),
    Icon: ArchitectureNavIcon,
  },
  {
    to: agentRoute("merchants"),
    label: "Merchants",
    matchPrefix: agentRoute("merchants"),
    Icon: MerchantsNavIcon,
  },
  {
    to: agentRoute("agents"),
    label: "Sub-agents",
    matchPrefix: agentRoute("agents"),
    Icon: AgentsNavIcon,
  },
  {
    to: agentRoute("service-bills"),
    label: "Service Bills",
    matchPrefix: agentRoute("service-bills"),
    Icon: ServiceBillsNavIcon,
  },
  {
    to: agentRoute("commissions"),
    label: "Commissions",
    matchPrefix: agentRoute("commissions"),
    Icon: FeesNavIcon,
  },
  {
    to: agentRoute("settings/team"),
    label: "Team",
    matchPrefix: agentRoute("settings/team"),
    Icon: TeamNavIcon,
  },
  {
    to: agentRoute("settings"),
    label: "Settings",
    end: true,
    Icon: SettingsNavIcon,
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

export function AgentShell({
  session,
  children,
  onSignOut,
  onSessionRefresh,
}: Props) {
  const location = useLocation();
  const readOnly = sessionIsAgentViewerOnly(session);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
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
    const sync = () => setUnreadAlerts(countUnreadPlatformAlerts());
    sync();
    return subscribePlatformAlerts(sync);
  }, []);

  useEffect(() => {
    ensureHealthPolling(true);
    const sync = (next: Awaited<ReturnType<typeof fetchPlatformHealth>>) => {
      syncPlatformHealthAlerts(next);
    };
    const unsub = subscribeSharedHealth(sync);
    void fetchPlatformHealth().then(sync);
    return () => {
      unsub();
      ensureHealthPolling(false);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <div
      className={`shell agent-shell platform-shell${navCollapsed ? " platform-shell--collapsed" : ""}${shellEnter ? " is-enter" : ""}${mobileNavOpen ? " portal-shell--nav-open" : ""}`}
    >
      <button
        type="button"
        className="portal-nav-backdrop"
        aria-label="Close navigation"
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={closeMobileNav}
      />
      <aside id="portal-sidebar" className="sidebar" aria-label="Agent navigation">
        <div className="logo-row">
          <GateLogoMark size={32} className="logo-mark" />
          {!navCollapsed ? (
            <div className="logo-copy">
              <p className="logo-title">PaymentGate</p>
              <span className="logo-badge">AGENT PORTAL</span>
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
        <nav className="nav-list" aria-label="Agent">
          <div className="nav-group">
            {!navCollapsed ? (
              <p
                className="nav-label"
                style={{ ["--nav-delay" as string]: "120ms" } as CSSProperties}
              >
                Agent controls
              </p>
            ) : null}
            {NAV.map((item, index) => {
              const { Icon } = item;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  title={item.label}
                  aria-label={item.label}
                  style={
                    {
                      ["--nav-delay" as string]: `${160 + index * 45}ms`,
                    } as CSSProperties
                  }
                  className={({ isActive }) => {
                    const path = location.pathname;
                    const prefixActive =
                      item.matchPrefix != null &&
                      path.startsWith(item.matchPrefix);
                    const active = isActive || prefixActive;
                    return `nav-item${active ? " active" : ""}`;
                  }}
                  onMouseEnter={() => prefetchAgentRoute(navPrefetchKey(item))}
                  onFocus={() => prefetchAgentRoute(navPrefetchKey(item))}
                >
                  <Icon />
                  {!navCollapsed ? <span>{item.label}</span> : null}
                </NavLink>
              );
            })}
          </div>
        </nav>
        <div className="sidebar-foot">
          <SidebarProfileMenu
            session={session}
            variant="agent"
            collapsed={navCollapsed}
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
          <div className="topbar-center" id="agent-topbar-center" />
          <div className="topbar-right">
            <div className="topbar-actions" id="agent-topbar-actions" />
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
              Read-only mode — Viewer accounts cannot onboard merchants or change
              rates.
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
