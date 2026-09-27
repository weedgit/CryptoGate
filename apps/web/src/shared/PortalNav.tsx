import type { ComponentType, CSSProperties, Ref } from "react";
import { NavLink, useLocation } from "react-router-dom";

export type PortalNavItem = {
  to: string;
  label: string;
  end?: boolean;
  matchPrefix?: string;
  matchPrefixes?: string[];
  /** Exact path match only (for parent that has children). */
  exactActive?: boolean;
  Icon: ComponentType<{ className?: string }>;
  /** Omit on nested items to show label-only (tree dot still marks the branch). */
  children?: Array<
    Omit<PortalNavItem, "children" | "Icon"> & { Icon?: PortalNavItem["Icon"] }
  >;
};

export type PortalNavGroup = {
  label: string;
  items: PortalNavItem[];
};

function navPrefetchKey(to: string): string {
  return to.replace(/^\//, "");
}

function navItemClass(
  pathname: string,
  item: PortalNavItem,
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

function navBranchOpen(pathname: string, item: PortalNavItem): boolean {
  if (!item.children?.length) return false;
  if (pathname.startsWith(item.to)) return true;
  return (
    item.matchPrefixes?.some((p) => pathname.startsWith(p)) ?? false
  );
}

type Props = {
  groups: PortalNavGroup[];
  collapsed: boolean;
  ariaLabel: string;
  prefetch: (path: string) => void;
  navRef?: Ref<HTMLElement>;
};

/** Grouped sidebar nav with collapsible child branches (shared by portal shells). */
export function PortalNav({ groups, collapsed, ariaLabel, prefetch, navRef }: Props) {
  const location = useLocation();
  let navDelayIndex = 0;

  return (
    <nav className="nav-list" aria-label={ariaLabel} ref={navRef}>
      {groups.map((group, groupIndex) => (
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
            const hasChildren = Boolean(item.children?.length) && !collapsed;
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
                  onMouseEnter={() => prefetch(navPrefetchKey(item.to))}
                  onFocus={() => prefetch(navPrefetchKey(item.to))}
                >
                  <Icon />
                  {!collapsed ? <span>{item.label}</span> : null}
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
                          onMouseEnter={() => prefetch(navPrefetchKey(child.to))}
                          onFocus={() => prefetch(navPrefetchKey(child.to))}
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
  );
}
