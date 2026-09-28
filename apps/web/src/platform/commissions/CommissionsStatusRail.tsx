import type { CSSProperties } from "react";
import { utcMidnightLabel } from "../../shared/dateTime";
import type { AuditLogEntry, BillingCalendarSettings } from "../api";
import { AutoScheduleCard } from "../ui/AutoScheduleCard";
import {
  STATUS_NAV,
  statusNavContains,
  type StatusFilter,
  type StatusNavItem,
} from "./commissionsShared";

const STATUS_ICON_TONE: Record<StatusFilter, "warn" | "teal" | "ok" | "slate"> =
  {
    all: "slate",
    issued: "warn",
    paid: "teal",
    settled: "ok",
  };

function StatusTabIcon({ id }: { id: StatusFilter }) {
  const tone = STATUS_ICON_TONE[id];
  const common = {
    className: `plat-bills__status-icon is-${tone}`,
    viewBox: "0 0 24 24",
    width: 20,
    height: 20,
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (id === "issued") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }
  if (id === "paid") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.2 1.9" />
      </svg>
    );
  }
  if (id === "settled") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.2 12.2 2.6 2.6 5-5.2" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="currentColor" stroke="none">
      <path d="M12 2.8 20.2 7.4v9.2L12 21.2 3.8 16.6V7.4L12 2.8Zm0 2.2L5.7 8.55 12 12.1l6.3-3.55L12 5ZM5.7 10.65v5.2L11.05 19V13.8L5.7 10.65Zm7.35 3.15V19l5.35-3.15v-5.2L13.05 13.8Z" />
    </svg>
  );
}

const STATUS_TREE_PAD = 6;
const STATUS_TREE_GUIDE = 16;
const STATUS_TREE_CHEVRON_HALF = 10;

function statusTreeCaretX(depth: number): number {
  return STATUS_TREE_PAD + depth * STATUS_TREE_GUIDE + STATUS_TREE_CHEVRON_HALF;
}

function StatusNavNodes({
  items,
  depth,
  ancestors = [],
  statusFilter,
  statusCounts,
  onSelect,
}: {
  items: StatusNavItem[];
  depth: number;
  ancestors?: boolean[];
  statusFilter: StatusFilter;
  statusCounts: Record<StatusFilter, number>;
  onSelect: (id: StatusFilter) => void;
}) {
  return (
    <>
      {items.map((item, index) => {
        const children = item.children;
        const hasChildren = Boolean(children?.length);
        const count = statusCounts[item.id];
        const active = statusFilter === item.id;
        const descendantActive = Boolean(
          children?.some((child) => statusNavContains(child, statusFilter)),
        );
        const branchOpen = hasChildren;
        const isLast = index === items.length - 1;
        const caretX = statusTreeCaretX(depth);
        const parentDepth = depth - 1;
        const parentRailX =
          depth > 0
            ? statusTreeCaretX(parentDepth)
            : STATUS_TREE_PAD + STATUS_TREE_CHEVRON_HALF;
        const forkGuideStart =
          STATUS_TREE_PAD + Math.max(0, parentDepth) * STATUS_TREE_GUIDE;
        const forkLeft =
          depth > 0 ? parentRailX - forkGuideStart : STATUS_TREE_CHEVRON_HALF;
        const forkWidth = depth > 0 ? caretX - parentRailX : 0;

        return (
          <div
            key={item.id}
            className={`b3-accounts__node${branchOpen ? " is-open" : ""}`}
            role="treeitem"
            aria-expanded={hasChildren ? branchOpen : undefined}
            aria-selected={active}
          >
            <button
              type="button"
              role="tab"
              className={`b3-accounts__row plat-bills__status-row${
                active ? " is-selected" : ""
              }${descendantActive ? " is-parent-active" : ""}`}
              style={
                {
                  ["--tree-stem-x"]: `${caretX}px`,
                  ["--tree-guide-w"]: `${STATUS_TREE_GUIDE}px`,
                  ["--tree-fork-left"]: `${forkLeft}px`,
                  ["--tree-fork-width"]: `${forkWidth}px`,
                } as CSSProperties
              }
              aria-selected={active}
              onClick={() => onSelect(item.id)}
            >
              {depth > 0 ? (
                <span className="b3-accounts__guides" aria-hidden>
                  {ancestors.map((show, guideIndex) => (
                    <span
                      key={`a-${guideIndex}`}
                      className={`b3-accounts__guide${show ? " is-line" : ""}`}
                    />
                  ))}
                  <span
                    className={`b3-accounts__guide is-fork${
                      isLast ? " is-last" : ""
                    }`}
                  />
                </span>
              ) : null}
              {hasChildren ? (
                <span className="b3-accounts__chevron" aria-hidden>
                  <span
                    className={`b3-accounts__caret${
                      branchOpen ? " is-open" : ""
                    }`}
                  />
                </span>
              ) : (
                <span
                  className="b3-accounts__chevron b3-accounts__chevron--spacer"
                  aria-hidden
                />
              )}
              <span className="plat-bills__status-badge" aria-hidden>
                <StatusTabIcon id={item.id} />
              </span>
              <span className="b3-accounts__name">
                <span className="b3-accounts__name-text">{item.label}</span>
              </span>
              <span className="plat-bills__status-item-count">{count}</span>
            </button>
            {branchOpen && children?.length ? (
              <div
                className="b3-accounts__children"
                role="group"
                aria-label={item.label}
                style={
                  {
                    ["--tree-line-x"]: `${caretX}px`,
                  } as CSSProperties
                }
              >
                <StatusNavNodes
                  items={children}
                  depth={depth + 1}
                  ancestors={depth > 0 ? [...ancestors, !isLast] : []}
                  statusFilter={statusFilter}
                  statusCounts={statusCounts}
                  onSelect={onSelect}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function CommissionsStatusRail({
  statusFilter,
  statusCounts,
  onSelect,
  isPortal,
  billingCalendar,
  lastAutoRun,
}: {
  statusFilter: StatusFilter;
  statusCounts: Record<StatusFilter, number>;
  onSelect: (id: StatusFilter) => void;
  isPortal: boolean;
  billingCalendar: BillingCalendarSettings | null;
  lastAutoRun: AuditLogEntry | null;
}) {
  return (
    <aside className="plat-bills__status-rail" aria-label="Invoice status">
      <p className="plat-bills__status-rail-title">Invoice status</p>
      <nav
        className="plat-bills__status-nav"
        role="tree"
        aria-label="Status filter"
      >
        <StatusNavNodes
          items={STATUS_NAV}
          depth={0}
          statusFilter={statusFilter}
          statusCounts={statusCounts}
          onSelect={onSelect}
        />
      </nav>
      <AutoScheduleCard
        schedule={
          billingCalendar
            ? `Monthly · day ${billingCalendar.agentPayDayStart} · ${utcMidnightLabel()}`
            : `Monthly · ${utcMidnightLabel()}`
        }
        lastRun={isPortal ? undefined : lastAutoRun}
        recentWithinMs={32 * 24 * 60 * 60 * 1000}
        note={
          isPortal
            ? "Invoices are created monthly by the platform. Confirm receipt once the remittance lands."
            : undefined
        }
      />
    </aside>
  );
}
