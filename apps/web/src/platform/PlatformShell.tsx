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
import {
  clearPlatformAlert,
  relativeAlertTime,
  upsertPlatformAlert,
} from "./platformAlerts";
import { AlertsDrawer } from "./ui/AlertsDrawer";

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
      try {
        const base =
          (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(
            /\/$/,
            "",
          ) || "";
        const res = await fetch(`${base}/health`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { status?: string; db?: string };
        if (cancelled) return;
        const next = {
          api: payload.status === "ok",
          database: payload.db === "ok",
          webhook: payload.status === "ok",
        };
        setHealth(next);

        if (next.api && next.database && next.webhook) {
          clearPlatformAlert("sys-api");
          clearPlatformAlert("sys-database");
          clearPlatformAlert("sys-webhook");
        } else {
          if (!next.api) {
            upsertPlatformAlert({
              id: "sys-api",
              category: "system",
              title: "API unreachable",
              body: "Platform API health check failed. Session calls may also fail until the API recovers.",
              at: relativeAlertTime(),
              href: "/platform/ops/health",
              hrefLabel: "System health",
              unread: true,
              tone: "anomaly",
            });
          } else {
            clearPlatformAlert("sys-api");
          }
          if (!next.database) {
            upsertPlatformAlert({
              id: "sys-database",
              category: "system",
              title: "Database unhealthy",
              body: "Postgres health check failed. Reads and writes may be interrupted.",
              at: relativeAlertTime(),
              href: "/platform/ops/health",
              hrefLabel: "System health",
              unread: true,
              tone: "anomaly",
            });
          } else {
            clearPlatformAlert("sys-database");
          }
          if (!next.webhook) {
            upsertPlatformAlert({
              id: "sys-webhook",
              category: "system",
              title: "Webhook path degraded",
              body: "Webhook worker health follows API status. Merchant signed deliveries may lag.",
              at: relativeAlertTime(),
              href: "/platform/ops/health",
              hrefLabel: "System health",
              unread: true,
              tone: "warn",
            });
          } else {
            clearPlatformAlert("sys-webhook");
          }
        }
      } catch {
        if (cancelled) return;
        setHealth({ api: false, database: false, webhook: false });
        upsertPlatformAlert({
          id: "sys-api",
          category: "system",
          title: "API / network unreachable",
          body: "Could not reach the platform health endpoint. Check API process and network connectivity.",
          at: relativeAlertTime(),
          href: "/platform/ops/health",
          hrefLabel: "System health",
          unread: true,
          tone: "anomaly",
        });
        upsertPlatformAlert({
          id: "sys-database",
          category: "system",
          title: "Database status unknown",
          body: "Health probe failed before DB status could be confirmed.",
          at: relativeAlertTime(),
          href: "/platform/ops/health",
          hrefLabel: "System health",
          unread: true,
          tone: "warn",
        });
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

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShellEnter(true));
    return () => window.cancelAnimationFrame(id);
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
      className={`shell platform-shell${collapsed ? " platform-shell--collapsed" : ""}${shellEnter ? " is-enter" : ""}`}
    >
      <aside
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
            <div className="topbar-leading" id="platform-topbar-leading" />
            <TopbarStatusRail />
          </div>
          <div className="topbar-center" id="platform-topbar-center" />
          <div className="topbar-right">
            <div className="topbar-actions" id="platform-topbar-actions" />
            <button
              type="button"
              className={`alerts-bell${alertsOpen ? " is-open" : ""}`}
              aria-label="Open alerts"
              aria-expanded={alertsOpen}
              aria-controls="alerts-drawer-title"
              title="Alerts"
              onClick={() => setAlertsOpen(true)}
            >
              <span
                className="alerts-bell-icon"
                style={{
                  WebkitMaskImage: "url(/icons/nav/bell-ring.svg)",
                  maskImage: "url(/icons/nav/bell-ring.svg)",
                }}
                aria-hidden
              />
              <span className="alerts-bell-dot" aria-hidden />
            </button>
          </div>
        </header>
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

      <AlertsDrawer open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  );
}
