import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { orgOwnerEmailMapFromBulkRows } from "../shared/registeredEmails";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { formatOnboardDate } from "../platform/orgDetailSeeds";
import {
  buildPlatformOrgForest,
  canAddSubAgentUnderNode,
  childTypeCounts,
  collectTreeNodeIds,
  countTreeNodes,
  defaultExpandedIds,
  expandedIdsForSelectedBranch,
  filterPlatformOrgForest,
  orgBreadcrumbPath,
  orgCanAddChild,
  visibleTreeNodeIds,
  type OrgTreeFilter,
  type PlatformOrgForest,
  type PlatformOrgTreeNode,
} from "../platform/platformOrgTree";
import { orgsInAgentSubtree } from "./agentSubtree";
import {
  ApiError,
  listOrgMemberEmails,
  listOrgs,
  type Session,
} from "./api";
import { orgTypeLabel, primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";
import { STRUCTURE_LABELS } from "./onboardMerchant";

const STATUS_PILLS: { id: OrgTreeFilter["status"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

const TYPE_OPTIONS: { id: OrgTreeFilter["type"]; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "agent", label: "Agent" },
  { id: "merchant", label: "Merchant" },
  { id: "site", label: "Sites" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function displayOrDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "—") return "-";
  return trimmed;
}

const REGISTRATION_HELP: Record<string, string> = {
  Country: "Country captured on the onboard Details step.",
  "Billing email":
    "Finance contact for service bills and billing notices. Stored on the org account — does not create a login.",
  "Owner email":
    "Portal Owner invite when present; otherwise the first team member on this account (for example Cashier on load-seed merchants).",
};

function MetaHelp({ text }: { text: string }) {
  return (
    <span className="plat-card-help org-architecture__meta-help">
      <button type="button" className="plat-card-help__btn" aria-label={text}>
        ?
      </button>
      <span className="plat-card-help__tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function treeBadgeClass(type: string): string {
  if (type === "agent" || type === "agent_sub") return "agent";
  if (type === "merchant_site") return "site";
  return "merchant";
}

function treeBadgeIcon(type: string): string {
  if (type === "agent" || type === "agent_sub") return "A";
  if (type === "merchant_site") return "S";
  return "M";
}

function agentDetailHref(type: string, id: string): string | null {
  if (type === "merchant" || type === "merchant_site") {
    return `/agent/merchants/${id}`;
  }
  if (type === "agent" || type === "agent_sub") return "/agent/agents";
  return null;
}

function agentDetailLabel(type: string): string | null {
  if (type === "merchant" || type === "merchant_site") return "Open merchant detail";
  if (type === "agent" || type === "agent_sub") return "Open sub-agents";
  return null;
}

function OrgTreeItem({
  node,
  depth,
  expanded,
  selectedId,
  onSelect,
  onToggle,
}: {
  node: PlatformOrgTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isPaused = node.status === "paused";

  const select = () => onSelect(node.id);
  const toggle = () => {
    if (hasChildren) onToggle(node.id);
  };

  return (
    <div
      id={`org-tree-${node.id}`}
      className="b3-accounts__node"
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={isSelected}
      data-org-id={node.id}
    >
      <div
        className={`b3-accounts__row org-architecture__row${isSelected ? " is-selected" : ""}${
          node.type === "merchant_site" ? " is-site" : ""
        }${isPaused ? " is-paused" : ""}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={select}
        onDoubleClick={(e) => {
          e.preventDefault();
          select();
          toggle();
        }}
        role="presentation"
      >
        {hasChildren ? (
          <button
            type="button"
            className="b3-accounts__chevron"
            tabIndex={-1}
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <span className={`b3-accounts__caret${isOpen ? " is-open" : ""}`} />
          </button>
        ) : (
          <span
            className="b3-accounts__chevron b3-accounts__chevron--spacer"
            aria-hidden
          />
        )}
        <span
          className={`b3-accounts__badge b3-accounts__badge--${treeBadgeClass(node.type)}`}
          aria-hidden
        >
          {treeBadgeIcon(node.type)}
        </span>
        <button
          type="button"
          className="b3-accounts__name org-architecture__name"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            select();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            select();
            toggle();
          }}
        >
          <span className="b3-accounts__name-text">{node.name}</span>
          <span className="org-architecture__row-meta">
            {isPaused ? (
              <span className="org-architecture__paused-dot" title="Paused" />
            ) : null}
            {hasChildren ? (
              <span className="org-architecture__child-count">{node.children.length}</span>
            ) : null}
            <span className="org-architecture__type-pill">
              {orgTypeLabel(node.type)}
            </span>
          </span>
        </button>
      </div>
      {hasChildren && isOpen
        ? node.children.map((child) => (
            <OrgTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  );
}

function OrgTreeDetail({
  node,
  byId,
  ownerEmailByOrgId,
  canOnboard,
}: {
  node: PlatformOrgTreeNode;
  byId: Map<string, PlatformOrgTreeNode>;
  ownerEmailByOrgId: ReadonlyMap<string, string>;
  canOnboard: boolean;
}) {
  const navigate = useNavigate();
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const counts = childTypeCounts(node);
  const detailHref = agentDetailHref(node.type, node.id);
  const detailLabel = agentDetailLabel(node.type);
  const canAdd = orgCanAddChild(node.type);
  const canSubAgent = canAddSubAgentUnderNode(node, byId);
  const breadcrumb = orgBreadcrumbPath(node.id, byId);
  const ownerEmail = ownerEmailByOrgId.get(node.id) ?? null;
  const isPaused = node.status === "paused";
  const showAdd = canOnboard && canAdd;
  const isAgentParent = node.type === "agent" || node.type === "agent_sub";

  useEffect(() => {
    setAddMenuOpen(false);
  }, [node.id]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDocPointer = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (!addMenuRef.current?.contains(e.target)) setAddMenuOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [addMenuOpen]);

  const registrationRows = [
    {
      label: "Registered",
      value: formatOnboardDate(node.createdAt),
    },
    { label: "Legal name", value: node.legalName },
    { label: "Country", value: node.country },
    { label: "Billing email", value: node.billingEmail },
    { label: "Owner email", value: ownerEmail },
  ];

  const detailRows = [
    { label: "Parent", value: node.parentName },
    {
      label: "Structure",
      value: node.structure
        ? (STRUCTURE_LABELS[node.structure as keyof typeof STRUCTURE_LABELS] ??
            node.structure)
        : null,
    },
    {
      label: "Direct children",
      value: String(counts.total),
    },
  ];

  return (
    <div className="org-architecture__detail-inner">
      <header className="org-architecture__detail-head">
        <div className="org-architecture__detail-avatar" aria-hidden>
          {initials(node.name)}
        </div>
        <h3 className="org-architecture__detail-title">{node.name}</h3>
        <div className="org-architecture__detail-meta">
          <div className="org-architecture__detail-badges">
            <span className="org-architecture__chip">{orgTypeLabel(node.type)}</span>
            <span
              className={`org-architecture__status ${
                isPaused ? "is-paused" : "is-active"
              }`}
            >
              {node.status}
            </span>
          </div>
          {showAdd && isAgentParent ? (
            <div className="org-architecture__actions" aria-label="Org actions">
              <div className="org-architecture__add-wrap" ref={addMenuRef}>
                <button
                  type="button"
                  className="org-architecture__action org-architecture__action--add"
                  aria-expanded={addMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setAddMenuOpen((open) => !open)}
                >
                  Add
                </button>
                {addMenuOpen ? (
                  <div
                    className="org-architecture__add-menu"
                    role="menu"
                    aria-label="Add child account"
                  >
                    {canSubAgent ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="org-architecture__add-option"
                        disabled
                      >
                        Sub-agent (soon)
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="org-architecture__add-option"
                      onClick={() => {
                        setAddMenuOpen(false);
                        navigate(
                          `/agent/merchants/new?parentId=${encodeURIComponent(node.id)}&returnTo=${encodeURIComponent("/agent/architecture")}`,
                        );
                      }}
                    >
                      Merchant
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {breadcrumb.length > 1 ? (
        <nav className="org-architecture__crumb" aria-label="Org path">
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.id} className="org-architecture__crumb-item">
              {index > 0 ? (
                <span className="org-architecture__crumb-sep" aria-hidden>
                  /
                </span>
              ) : null}
              <span>{crumb.name}</span>
            </span>
          ))}
        </nav>
      ) : null}

      <div
        className={`org-architecture__mini-stats${
          counts.agents > 0 || counts.merchants > 0 ? "" : " is-empty"
        }`}
        aria-label="Direct children"
        aria-hidden={counts.agents === 0 && counts.merchants === 0}
      >
        {counts.agents > 0 ? (
          <div className="org-architecture__mini-stat">
            <span className="org-architecture__mini-stat-value">{counts.agents}</span>
            <span className="org-architecture__mini-stat-label">Agents</span>
          </div>
        ) : null}
        {counts.merchants > 0 ? (
          <div className="org-architecture__mini-stat">
            <span className="org-architecture__mini-stat-value">
              {counts.merchants}
            </span>
            <span className="org-architecture__mini-stat-label">Merchants</span>
          </div>
        ) : null}
      </div>

      <div className="org-architecture__info-grid">
        <section className="org-architecture__section org-architecture__section--registration">
          <h4 className="org-architecture__section-title">Registration</h4>
          <dl className="org-architecture__meta">
            {registrationRows.map((row) => {
              const help = REGISTRATION_HELP[row.label];
              return (
                <div key={row.label}>
                  <dt>
                    <span>{row.label}</span>
                    {help ? <MetaHelp text={help} /> : null}
                  </dt>
                  <dd>{displayOrDash(row.value)}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        <section className="org-architecture__section">
          <h4 className="org-architecture__section-title">Details</h4>
          <dl className="org-architecture__meta">
            {detailRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{displayOrDash(row.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {detailHref && detailLabel ? (
        <div className="org-architecture__detail-foot">
          <Link className="org-architecture__cta" to={detailHref}>
            {detailLabel}
            <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_FILTER: OrgTreeFilter = {
  query: "",
  type: "all",
  status: "all",
};

const EMPTY_FOREST: PlatformOrgForest = {
  roots: [],
  byId: new Map(),
  stats: {
    total: 0,
    platform: 0,
    agents: 0,
    merchants: 0,
    sites: 0,
    paused: 0,
  },
  orphanCount: 0,
};

/** Agent subtree org hierarchy — read-only except onboard merchant. */
export function ArchitecturePage({ session }: { session: Session }) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canOnboard = useMemo(() => sessionCanOnboardMerchant(session), [session]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forest, setForest] = useState<PlatformOrgForest>(EMPTY_FOREST);
  const [filter, setFilter] = useState<OrgTreeFilter>(EMPTY_FILTER);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownerEmailByOrgId, setOwnerEmailByOrgId] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(null);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("agent-topbar-center"));
    setTopbarActionsSlot(document.getElementById("agent-topbar-actions"));
  }, []);

  useLayoutEffect(() => {
    const page = pageRef.current;
    const main = document.querySelector(".agent-shell .main");
    const topbar = document.querySelector(".agent-shell .topbar");
    if (!page || !(main instanceof HTMLElement) || !(topbar instanceof HTMLElement)) {
      return;
    }

    const syncStickyTop = () => {
      const mainTop = main.getBoundingClientRect().top;
      const topbarBottom = topbar.getBoundingClientRect().bottom;
      const stickyTop = Math.max(0, Math.ceil(topbarBottom - mainTop));
      page.style.setProperty("--org-architecture-sticky-top", `${stickyTop}px`);
    };

    syncStickyTop();
    const ro = new ResizeObserver(syncStickyTop);
    ro.observe(topbar);
    ro.observe(main);
    window.addEventListener("resize", syncStickyTop);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncStickyTop);
    };
  }, []);

  const load = useCallback(async () => {
    if (!agentId) {
      setError("No agent org found for this session.");
      setForest(EMPTY_FOREST);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [orgs, emailRows] = await Promise.all([
        listOrgs(),
        listOrgMemberEmails().catch(() => [] as Awaited<
          ReturnType<typeof listOrgMemberEmails>
        >),
      ]);
      const scoped = orgsInAgentSubtree(agentId, orgs);
      const nextForest = buildPlatformOrgForest(scoped);
      setForest(nextForest);
      setOwnerEmailByOrgId(orgOwnerEmailMapFromBulkRows(emailRows));
      setExpanded(defaultExpandedIds(nextForest.roots));
      setSelectedId((prev) =>
        prev && nextForest.byId.has(prev)
          ? prev
          : (nextForest.roots[0]?.id ?? null),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load org tree");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRoots = useMemo(
    () => filterPlatformOrgForest(forest.roots, filter),
    [forest.roots, filter],
  );

  const visibleIds = useMemo(
    () => visibleTreeNodeIds(filteredRoots, expanded),
    [filteredRoots, expanded],
  );

  const visibleCount = useMemo(
    () => countTreeNodes(filteredRoots),
    [filteredRoots],
  );

  const selectedNode =
    selectedId != null ? (forest.byId.get(selectedId) ?? null) : null;

  const treeRef = useRef<HTMLDivElement | null>(null);

  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    treeRef.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      const el = treeRef.current?.querySelector(
        `[data-org-id="${CSS.escape(id)}"] .org-architecture__row`,
      );
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: "nearest" });
      }
    });
  }, []);

  const onToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onTreeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight"
    ) {
      return;
    }
    if (visibleIds.length === 0) return;
    e.preventDefault();

    const currentId = selectedId ?? visibleIds[0]!;
    const index = Math.max(0, visibleIds.indexOf(currentId));
    const node = forest.byId.get(currentId);

    if (e.key === "ArrowDown") {
      const nextId = visibleIds[Math.min(index + 1, visibleIds.length - 1)];
      if (nextId) onSelect(nextId);
      return;
    }
    if (e.key === "ArrowUp") {
      const prevId = visibleIds[Math.max(index - 1, 0)];
      if (prevId) onSelect(prevId);
      return;
    }
    if (e.key === "ArrowRight") {
      if (!node) return;
      if (node.children.length > 0 && !expanded.has(node.id)) {
        onToggle(node.id);
        return;
      }
      if (node.children.length > 0 && expanded.has(node.id)) {
        onSelect(node.children[0]!.id);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      if (!node) return;
      if (node.children.length > 0 && expanded.has(node.id)) {
        onToggle(node.id);
        return;
      }
      if (node.parentId && forest.byId.has(node.parentId)) {
        onSelect(node.parentId);
      }
    }
  };

  const expandAll = () => {
    setExpanded(new Set(collectTreeNodeIds(filteredRoots)));
  };

  const collapseAll = () => {
    setExpanded(expandedIdsForSelectedBranch(selectedId, forest.byId));
  };

  const enterOnceRef = useRef(false);
  const [enterMotion, setEnterMotion] = useState(false);
  useEffect(() => {
    if (loading || enterOnceRef.current) return;
    enterOnceRef.current = true;
    const id = window.requestAnimationFrame(() => setEnterMotion(true));
    return () => window.cancelAnimationFrame(id);
  }, [loading]);

  return (
    <div
      className={`org-architecture${enterMotion ? " is-enter" : ""}`}
      ref={pageRef}
    >
      <AuthToast
        message={toastMessage}
        tone="error"
        onDismiss={dismissToast}
      />
      {error ? <p className="error">{error}</p> : null}

      {topbarSlot
        ? createPortal(
            <label className="org-agents__search-wrap">
              <span className="org-agents__search-icon" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <circle
                    cx="8.5"
                    cy="8.5"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M12.75 12.75 16.5 16.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                className="field-control org-agents__search"
                type="search"
                placeholder="Filter by org name…"
                value={filter.query}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, query: e.target.value }))
                }
                aria-label="Filter org tree"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div
              className="org-architecture__topbar-actions"
              aria-label="Org map filters"
            >
              <label className="org-architecture__select-wrap">
                <span className="sr-only">Org type</span>
                <select
                  className="org-architecture__select org-architecture__select--topbar"
                  value={filter.type}
                  aria-label="Org type"
                  onChange={(e) =>
                    setFilter((f) => ({
                      ...f,
                      type: e.target.value as OrgTreeFilter["type"],
                    }))
                  }
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="org-agents__pills" role="group" aria-label="Status filter">
                {STATUS_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    className={`org-agents__pill org-architecture__pill${
                      filter.status === pill.id ? " is-active" : ""
                    }`}
                    aria-pressed={filter.status === pill.id}
                    onClick={() =>
                      setFilter((f) => ({ ...f, status: pill.id }))
                    }
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              <div
                className="org-architecture__tree-btns"
                role="group"
                aria-label="Tree actions"
              >
                <button
                  type="button"
                  className="org-architecture__icon-btn"
                  onClick={expandAll}
                  title="Expand all nodes"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  className="org-architecture__icon-btn"
                  onClick={collapseAll}
                  title={
                    selectedId
                      ? "Collapse all except the selected branch"
                      : "Collapse all nodes"
                  }
                >
                  Collapse all
                </button>
                <button
                  type="button"
                  className="org-architecture__icon-btn"
                  onClick={() => void load()}
                  disabled={loading}
                  title="Refresh org list"
                >
                  Refresh
                </button>
              </div>
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="panel org-architecture__summary">
        <div className="org-architecture__metrics">
          <div className="org-architecture__metric">
            <span className="org-architecture__metric-value">
              {loading ? "…" : forest.stats.total.toLocaleString()}
            </span>
            <span className="org-architecture__metric-label">Total orgs</span>
          </div>
          <div className="org-architecture__metric">
            <span className="org-architecture__metric-value">
              {loading ? "…" : forest.stats.agents.toLocaleString()}
            </span>
            <span className="org-architecture__metric-label">Agents</span>
          </div>
          <div className="org-architecture__metric">
            <span className="org-architecture__metric-value">
              {loading ? "…" : forest.stats.merchants.toLocaleString()}
            </span>
            <span className="org-architecture__metric-label">Merchants</span>
          </div>
          <div className="org-architecture__metric">
            <span className="org-architecture__metric-value">
              {loading ? "…" : forest.stats.sites.toLocaleString()}
            </span>
            <span className="org-architecture__metric-label">Sites</span>
          </div>
          <div className="org-architecture__metric org-architecture__metric--warn">
            <span className="org-architecture__metric-value">
              {loading ? "…" : forest.stats.paused.toLocaleString()}
            </span>
            <span className="org-architecture__metric-label">Paused</span>
          </div>
        </div>
      </div>

      {forest.orphanCount > 0 ? (
        <p className="banner banner-warn org-architecture__orphans">
          {forest.orphanCount} org(s) have a missing parent and appear at the root
          level.
        </p>
      ) : null}

      <div className="panel org-architecture__workspace">
        <div className="org-architecture__map">
          <section className="org-architecture__tree-pane" aria-label="Org hierarchy">
            <header className="org-architecture__pane-head org-architecture__pane-head--row">
              <h3 className="org-architecture__pane-title">Hierarchy</h3>
              <p className="org-architecture__pane-sub">
                {loading ? "Loading…" : `${visibleCount.toLocaleString()} visible nodes`}
              </p>
            </header>
            <div
              ref={treeRef}
              className="org-architecture__tree-scroll b3-accounts__tree"
              role="tree"
              tabIndex={0}
              aria-label="Org hierarchy"
              aria-activedescendant={
                selectedId ? `org-tree-${selectedId}` : undefined
              }
              onKeyDown={onTreeKeyDown}
            >
              {loading ? (
                <PlatformPending
                  className="org-architecture__empty"
                  title="Loading org tree"
                  copy="Building your agent subtree."
                />
              ) : filteredRoots.length === 0 ? (
                <div className="org-architecture__empty">
                  <p className="org-architecture__empty-title">No matches</p>
                  <p>Try clearing filters or broadening your search.</p>
                </div>
              ) : (
                filteredRoots.map((node) => (
                  <OrgTreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onToggle={onToggle}
                  />
                ))
              )}
            </div>
          </section>

          <aside className="org-architecture__detail-pane" aria-label="Org detail">
            <div className="org-architecture__detail-scroll">
              {selectedNode ? (
                <OrgTreeDetail
                  node={selectedNode}
                  byId={forest.byId}
                  ownerEmailByOrgId={ownerEmailByOrgId}
                  canOnboard={canOnboard}
                />
              ) : (
                <div className="org-architecture__detail-empty">
                  <p className="org-architecture__empty-title">No selection</p>
                  <p>Select an org in the tree to view its profile and links.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
