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
  ArchitectureNavIcon,
  AuditLogNavIcon,
  ComplianceNavIcon,
  DashboardNavIcon,
  HealthNavIcon,
  NetworkNavIcon,
  ServiceBillsNavIcon,
  FeesNavIcon,
  SidebarCollapseIcon,
  TeamNavIcon,
} from "./NavIcons";
import { SidebarProfileMenu } from "../auth/SidebarProfileMenu";
import { GateLogoMark } from "../auth/GateLogoMark";
import { sessionIsPlatformViewerOnly } from "./org";
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

function PlatformHealthBeacon() {
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
  return null;
}

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  matchPrefix?: string;
  matchPrefixes?: string[];
  /** Exact path match only (for parent that has children). */
  exactActive?: boolean;
  Icon: ComponentType<{ className?: string }>;
  /** Omit on nested items to show label-only (tree dot still marks the branch). */
  children?: Array<Omit<NavItem, "children" | "Icon"> & { Icon?: NavItem["Icon"] }>;
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

const SIDEBAR_KEY = "paymentgate.platform.sidebarCollapsed";

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
  if (item.exactActive) {
    const base = item.to.replace(/\/$/, "") || "/";
    const onNamedChild =
      item.children?.some(
        (c) =>
          pathname === c.to ||
          pathname.startsWith(`${c.to}/`) ||
          (c.matchPrefix != null && pathname.startsWith(c.matchPrefix)),
      ) ?? false;
    if (onNamedChild) return "nav-item";
    if (pathname === base || pathname === `${base}/`) {
      return "nav-item active";
    }
    if (pathname.startsWith(`${base}/`)) {
      return "nav-item active";
    }
    const prefixHit =
      item.matchPrefixes?.some((p) => pathname.startsWith(p)) ?? false;
    return `nav-item${prefixHit && !onNamedChild ? " active" : ""}`;
  }
  const prefixActive =
    (item.matchPrefix != null && pathname.startsWith(item.matchPrefix)) ||
    (item.matchPrefixes?.some((p) => pathname.startsWith(p)) ?? false);
  const active = isActive || prefixActive;
  return `nav-item${active ? " active" : ""}`;
}

function navBranchOpen(pathname: string, item: NavItem): boolean {
  if (!item.children?.length) return false;
  if (pathname.startsWith(item.to)) return true;
  return (
    item.matchPrefixes?.some((p) => pathname.startsWith(p)) ?? false
  );
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
      <PlatformHealthBeacon />
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
          <GateLogoMark size={52} className="logo-mark" />
          {!navCollapsed ? (
            <div className="logo-copy">
              <p className="logo-title">PaymentGate</p>
              <span className="logo-rule" aria-hidden />
              <span className="logo-tagline">Powering payment</span>
            </div>
          ) : null}
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
                const hasChildren = Boolean(item.children?.length) && !navCollapsed;
                const branchOpen = hasChildren
                  ? navBranchOpen(location.pathname, item)
                  : false;
                return (
                  <div
                    key={item.to}
                    className={`nav-branch${branchOpen ? " is-open" : ""}${
                      hasChildren ? " has-children" : ""
                    }`}
                  >
                    <NavLink
                      to={item.to}
                      end={item.end ?? false}
                      title={item.label}
                      aria-label={item.label}
                      aria-expanded={hasChildren ? branchOpen : undefined}
                      style={{ "--nav-delay": `${delayMs}ms` } as CSSProperties}
                      className={({ isActive }) =>
                        navItemClass(location.pathname, item, isActive)
                      }
                      onMouseEnter={() =>
                        prefetchPlatformRoute(navPrefetchKey(item))
                      }
                      onFocus={() => prefetchPlatformRoute(navPrefetchKey(item))}
                    >
                      <Icon />
                      {!navCollapsed ? <span>{item.label}</span> : null}
                      {hasChildren ? (
                        <span className="nav-branch__chevron" aria-hidden>
                          <svg viewBox="0 0 10 6" width="10" height="6" fill="none">
                            <path
                              d="M1 1l4 4 4-4"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      ) : null}
                    </NavLink>
                    {hasChildren && branchOpen ? (
                      <div className="nav-sub" role="group" aria-label={item.label}>
                        {item.children!.map((child) => {
                          const ChildIcon = child.Icon;
                          const childDelay = 120 + navDelayIndex * 38;
                          navDelayIndex += 1;
                          return (
                            <NavLink
                              key={child.to}
                              to={child.to}
                              title={child.label}
                              aria-label={child.label}
                              style={
                                {
                                  "--nav-delay": `${childDelay}ms`,
                                } as CSSProperties
                              }
                              className={({ isActive }) => {
                                const prefixActive =
                                  child.matchPrefix != null &&
                                  location.pathname.startsWith(child.matchPrefix);
                                return `nav-sub__item${
                                  isActive || prefixActive ? " is-active" : ""
                                }`;
                              }}
                              onMouseEnter={() =>
                                prefetchPlatformRoute(
                                  child.to.replace(/^\//, ""),
                                )
                              }
                              onFocus={() =>
                                prefetchPlatformRoute(
                                  child.to.replace(/^\//, ""),
                                )
                              }
                            >
                              <span className="nav-sub__dot" aria-hidden />
                              {ChildIcon ? <ChildIcon /> : null}
                              <span>{child.label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main" ref={mainRef}>
        <header className="topbar topbar--chrome">
          <div className="topbar-left">
            <MobileNavToggle open={mobileNavOpen} onToggle={toggleMobileNav} />
            <button
              type="button"
              className="sidebar-toggle sidebar-toggle--topbar"
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
            <div className="topbar-leading" id="platform-topbar-leading" />
          </div>
          <div className="topbar-center">
            <TopbarSearch placeholder="Search merchants, transactions, or accounts..." />
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
