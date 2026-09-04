import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getPlatformOrgs,
  getPlatformServiceBills,
  invalidatePlatformOrgList,
  listPlatformOrgMemberEmails,
  peekPlatformOrgs,
  peekPlatformServiceBills,
  PLATFORM_ORGS_UPDATED_EVENT,
  refreshPlatformOrgList,
  removePlatformOrgFromList,
  setOrgStatus,
  type OrgAccount,
  type ServiceBill,
  type Session,
} from "./api";
import { looksLikeEmailQuery, orgEmailsMapFromBulkRows } from "../shared/registeredEmails";
import { AgentDetailCard } from "./AgentDetailCard";
import { merchantCountsByAgentId, merchantOrgIdsInAgentSubtree } from "./agentSubtree";
import { OrgListPagination } from "./OrgListPagination";
import { scrollOrgSplitPaneIntoView } from "../shared/scrollOrgSplitPane";
import type { OnboardNavigateState } from "../shared/onboardInviteState";
import { useAutoSelectOrgListRow } from "../shared/useAutoSelectOrgListRow";
import { handleOrgTableKeyDown } from "./orgTableKeyboard";
import { orgTypeLabel, sessionCanManagePlatform, sessionIsPlatformViewerOnly } from "./org";
import { SuspendOrgModal } from "./ui/SuspendOrgModal";
import { OrgDeleteConfirmModal } from "./ui/OrgDeleteConfirmModal";
import { useOrgDeleteModal } from "./useOrgDeleteModal";
import {
  DEFAULT_AGENT_COMMISSION_PERCENT,
  mergeCommissionHistory,
  resolveAgentPayoutStatus,
  type AgentPayoutStatus,
} from "./orgDetailSeeds";

type Props = { session: Session };

type StatusFilter = "all" | "active" | "paused";

type SortKey = "name" | "type" | "parent" | "merchants" | "payout" | "status";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

const PAGE_SIZE = 20;

const PAYOUT_SORT_RANK: Record<"paid" | "pending" | "scheduled", number> = {
  paid: 0,
  pending: 1,
  scheduled: 2,
};

function payoutSortRank(status: AgentPayoutStatus | null): number {
  if (!status) return 3;
  return PAYOUT_SORT_RANK[status];
}

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function ArrangeIcon({ dir }: { dir: SortDir | null }) {
  const showUp = dir === null || dir === "asc";
  const showDown = dir === null || dir === "desc";
  return (
    <span
      className={`plat-pair-table__arrange${dir ? " is-active" : " is-idle"}`}
      aria-hidden="true"
    >
      {showUp ? (
        <svg
          className={`plat-pair-table__arrange-up${dir === "asc" ? " is-on" : ""}`}
          viewBox="0 0 8 4"
          aria-hidden="true"
        >
          <path
            d="M1.25 3.25 4 0.75 6.75 3.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {showDown ? (
        <svg
          className={`plat-pair-table__arrange-down${dir === "desc" ? " is-on" : ""}`}
          viewBox="0 0 8 4"
          aria-hidden="true"
        >
          <path
            d="M1.25 0.75 4 3.25 6.75 0.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "end";
}) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th
      className={[className, active ? "is-sorted" : "", align === "end" ? "is-end" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={`org-agents__sort-btn${active ? " is-active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onSort(sortKey);
        }}
      >
        <span>{label}</span>
        <ArrangeIcon dir={active ? sort.dir : null} />
      </button>
    </th>
  );
}

type AgentsListEmptyVariant =
  | "loading"
  | "searching"
  | "no-agents"
  | "no-results"
  | "no-filter"
  | "error";

function AgentsListEmptyPanel({
  variant,
  query,
  statusFilter,
  canManage,
  onClearSearch,
  onClearFilter,
  onRetry,
}: {
  variant: AgentsListEmptyVariant;
  query?: string;
  statusFilter?: StatusFilter;
  canManage?: boolean;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
  onRetry?: () => void;
}) {
  const title =
    variant === "loading"
      ? "Loading agents"
      : variant === "searching"
        ? "Searching by email"
        : variant === "no-agents"
          ? "No agent accounts yet"
          : variant === "no-results"
            ? "No matching agents"
            : variant === "no-filter"
              ? `No ${statusFilter === "paused" ? "paused" : "active"} agents`
              : "Could not load agents";

  const copy =
    variant === "loading"
      ? "Fetching agent accounts from the platform."
      : variant === "searching"
        ? "Looking up team contact emails across agent orgs. Matches appear as they are found."
        : variant === "no-agents"
          ? "Add your first agent to start building the merchant network."
          : variant === "no-results"
            ? query
              ? `Nothing matched “${query}”. Try a different name, email, or org ID.`
              : "Try a different name, email, or org ID."
            : variant === "no-filter"
              ? "Change the status filter or switch back to All to see more accounts."
              : "The agent list could not be loaded. Check your connection and try again.";

  return (
    <div className="org-agents__list-empty b3-empty" role="status">
      <div
        className={`b3-empty__mark${variant === "loading" || variant === "searching" ? " is-busy" : ""}`}
        aria-hidden
      >
        {variant === "loading" || variant === "searching" ? (
          <span className="cg-spinner cg-spinner--md org-agents__list-empty-spinner" />
        ) : variant === "no-results" ? (
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M27 27 36 36"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M16 20h8M20 16v8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.45"
            />
          </svg>
        ) : variant === "error" ? (
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1.6" />
            <path d="M24 16v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="24" cy="32" r="1.2" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <rect x="6" y="10" width="14" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
            <rect x="28" y="10" width="14" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
            <path d="M20 24h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
          </svg>
        )}
      </div>
      <p className="b3-empty__title">{title}</p>
      <p className="b3-empty__copy">{copy}</p>
      {variant === "no-results" || variant === "searching" ? (
        <ul className="b3-empty__hints">
          <li>Search by agent name, team email, or org ID</li>
          <li>Email lookup may take a few seconds</li>
        </ul>
      ) : variant === "no-agents" ? (
        <ul className="b3-empty__hints">
          <li>Agents onboard merchants under their subtree</li>
          <li>Commission is settled to the agent payout address</li>
        </ul>
      ) : null}
      <div className="org-agents__list-empty-actions">
        {variant === "no-results" && onClearSearch ? (
          <button type="button" className="btn-ghost btn-inline" onClick={onClearSearch}>
            Clear search
          </button>
        ) : null}
        {variant === "no-filter" && onClearFilter ? (
          <button type="button" className="btn-ghost btn-inline" onClick={onClearFilter}>
            Show all agents
          </button>
        ) : null}
        {variant === "no-agents" && canManage ? (
          <Link className="btn-primary btn-inline" to={platformRoute("agents/new")}>
            Onboard agent
          </Link>
        ) : null}
        {variant === "error" && onRetry ? (
          <button type="button" className="btn-primary btn-inline" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** B2 — Agent accounts: half-width table + side detail card. */
export function AgentsListPage({ session }: Props) {
  const { id: selectedId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const inviteState = (location.state ?? {}) as OnboardNavigateState;
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const readOnly = useMemo(() => sessionIsPlatformViewerOnly(session), [session]);
  const [orgs, setOrgs] = useState<OrgAccount[]>(() => peekPlatformOrgs() ?? []);
  const [bills, setBills] = useState<ServiceBill[]>(
    () => peekPlatformServiceBills() ?? [],
  );
  const [orgEmailsByOrgId, setOrgEmailsByOrgId] = useState<Map<string, string[]>>(
    () => new Map(),
  );
  const [emailIndexLoading, setEmailIndexLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(() => peekPlatformOrgs() == null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "error">("ok");
  const dismissToast = useCallback(() => {
    setMsg(null);
    setError(null);
  }, []);
  const toastMessage = error ?? msg;

  const showOk = useCallback((text: string) => {
    setError(null);
    setToastTone("ok");
    setMsg(text);
  }, []);

  const showErr = useCallback((text: string) => {
    setMsg(null);
    setToastTone("error");
    setError(text);
  }, []);

  const {
    deleteTarget,
    deletePreview,
    deletePreviewLoading,
    deleteError,
    deleteBusy,
    openDelete,
    closeDelete,
    confirmDelete,
  } = useOrgDeleteModal({
    canManage,
    onDeleted: async (deletedId) => {
      removePlatformOrgFromList(deletedId);
      setOrgs((prev) => prev.filter((o) => o.id !== deletedId));
      if (selectedId === deletedId) {
        navigate(platformRoute("agents"));
      }
      await refreshPlatformOrgList({ excludeOrgIds: [deletedId] });
    },
    showOk,
  });

  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const prevPathRef = useRef(location.pathname);
  const [suspendTarget, setSuspendTarget] = useState<OrgAccount | null>(null);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  useLayoutEffect(() => {
    const page = pageRef.current;
    const main = document.querySelector(".platform-shell .main");
    const topbar = document.querySelector(".platform-shell .topbar");
    if (!page || !(main instanceof HTMLElement) || !(topbar instanceof HTMLElement)) {
      return;
    }

    const syncStickyTop = () => {
      const mainTop = main.getBoundingClientRect().top;
      const topbarBottom = topbar.getBoundingClientRect().bottom;
      const stickyTop = Math.max(0, Math.ceil(topbarBottom - mainTop));
      page.style.setProperty("--org-agents-sticky-top", `${stickyTop}px`);
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
  }, [loading]);

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const hasCachedOrgs = peekPlatformOrgs() != null;
    // Paint agents as soon as orgs are ready; bills only feed payout column.
    if (!opts?.silent && !hasCachedOrgs) setLoading(true);
    setError(null);
    try {
      const orgRows = await getPlatformOrgs({ force: opts?.force });
      setOrgs(orgRows);
      if (!opts?.silent) setLoading(false);
      const billRows = await getPlatformServiceBills().catch(
        () => [] as ServiceBill[],
      );
      setBills(billRows);
    } catch (err) {
      const text =
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load agents";
      showErr(text);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [showErr]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOrgsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<OrgAccount[]>).detail;
      if (Array.isArray(detail)) {
        setOrgs(detail);
        return;
      }
      void load({ silent: true });
    };
    window.addEventListener(PLATFORM_ORGS_UPDATED_EVENT, onOrgsUpdated);
    return () => {
      window.removeEventListener(PLATFORM_ORGS_UPDATED_EVENT, onOrgsUpdated);
    };
  }, [load]);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = location.pathname;
    if (location.pathname.endsWith("/agents/new")) return;
    const leftOnboard = prev.endsWith("/agents/new");
    void load({
      silent: !leftOnboard && peekPlatformOrgs() != null,
      force: leftOnboard,
    });
  }, [location.pathname, load]);

  const agents = useMemo(
    () => orgs.filter((o) => o.type === "agent" || o.type === "agent_sub"),
    [orgs],
  );

  const agentIdsKey = useMemo(
    () => agents.map((a) => a.id).sort().join("|"),
    [agents],
  );

  useEffect(() => {
    if (!looksLikeEmailQuery(query)) {
      setOrgEmailsByOrgId(new Map());
      setEmailIndexLoading(false);
      return;
    }
    if (agents.length === 0) return;

    let cancelled = false;
    setEmailIndexLoading(true);

    void listPlatformOrgMemberEmails({ types: ["agent", "agent_sub"] })
      .then((rows) => {
        if (cancelled) return;
        setOrgEmailsByOrgId(orgEmailsMapFromBulkRows(rows));
      })
      .catch(() => {
        if (!cancelled) setOrgEmailsByOrgId(new Map());
      })
      .finally(() => {
        if (!cancelled) setEmailIndexLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentIdsKey, agents.length, query]);

  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const merchantCountByAgent = useMemo(
    () => merchantCountsByAgentId(orgs),
    [orgs],
  );

  const payoutByAgentId = useMemo(() => {
    const map = new Map<string, AgentPayoutStatus | null>();
    for (const agent of agents) {
      const merchantIds = merchantOrgIdsInAgentSubtree(agent.id, orgs);
      const history = mergeCommissionHistory(
        bills,
        merchantIds,
        agent.id,
        DEFAULT_AGENT_COMMISSION_PERCENT,
        1,
      );
      map.set(agent.id, resolveAgentPayoutStatus(history));
    }
    return map;
  }, [agents, orgs, bills]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = agents.filter((o) => {
      const status = o.status ?? "active";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      if (o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)) {
        return true;
      }
      const emails = orgEmailsByOrgId.get(o.id) ?? [];
      return emails.some((email) => email.includes(q));
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "name") {
        return dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "type") {
        const byType = dir * orgTypeLabel(a.type).localeCompare(orgTypeLabel(b.type));
        return byType !== 0 ? byType : dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "parent") {
        const pa = a.parentId ? (byId.get(a.parentId)?.name ?? a.parentId) : "";
        const pb = b.parentId ? (byId.get(b.parentId)?.name ?? b.parentId) : "";
        const byParent = dir * pa.localeCompare(pb);
        return byParent !== 0 ? byParent : dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "merchants") {
        const ca = merchantCountByAgent.get(a.id) ?? 0;
        const cb = merchantCountByAgent.get(b.id) ?? 0;
        if (ca !== cb) return dir * (ca - cb);
        return dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "payout") {
        const pa = payoutSortRank(payoutByAgentId.get(a.id) ?? null);
        const pb = payoutSortRank(payoutByAgentId.get(b.id) ?? null);
        if (pa !== pb) return dir * (pa - pb);
        return dir * a.name.localeCompare(b.name);
      }
      const sa = a.status ?? "active";
      const sb = b.status ?? "active";
      const byStatus = dir * sa.localeCompare(sb);
      return byStatus !== 0 ? byStatus : dir * a.name.localeCompare(b.name);
    });
  }, [agents, query, statusFilter, sort, byId, merchantCountByAgent, payoutByAgentId, orgEmailsByOrgId]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sort]);

  const onSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const filteredIds = useMemo(() => filtered.map((row) => row.id), [filtered]);
  const agentIds = useMemo(() => agents.map((row) => row.id), [agents]);

  useAutoSelectOrgListRow({
    selectedId,
    loading,
    allIds: agentIds,
    filteredIds,
    basePath: platformRoute("agents"),
    navigate,
    emailIndexLoading,
    query,
    preserveSelectionId: inviteState.onboardedOrgId,
  });

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return agents.find((a) => a.id === selectedId) ?? null;
  }, [agents, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const index = filtered.findIndex((row) => row.id === selectedId);
    if (index === -1) return;
    const targetPage = Math.floor(index / PAGE_SIZE) + 1;
    setPage((current) => (current === targetPage ? current : targetPage));
  }, [selectedId, filtered]);

  const selectAgent = (id: string) => {
    startTransition(() => {
      navigate(platformRoute(`agents/${id}`));
    });
    tableRef.current?.focus({ preventScroll: true });
    scrollOrgSplitPaneIntoView();
  };

  const clearSelection = () => {
    navigate(platformRoute("agents"));
  };

  async function onSetStatus(
    row: OrgAccount,
    status: "active" | "paused",
    reason?: string,
  ): Promise<string | null> {
    if (!canManage) return "Not allowed";
    setBusyId(row.id);
    setMsg(null);
    setError(null);
    try {
      await setOrgStatus(
        row.id,
        status,
        reason ? { reason } : undefined,
      );
      invalidatePlatformOrgList();
      setOrgs((prev) =>
        prev.map((o) => (o.id === row.id ? { ...o, status } : o)),
      );
      showOk(
        status === "paused" ? `Paused ${row.name}.` : `Resumed ${row.name}.`,
      );
      return null;
    } catch (err) {
      const text =
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Status update failed";
      showErr(text);
      return text;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSuspend(reason: string) {
    if (!suspendTarget) return;
    setSuspendError(null);
    const err = await onSetStatus(suspendTarget, "paused", reason || undefined);
    if (err) setSuspendError(err);
    else setSuspendTarget(null);
  }

  const searchingByEmail =
    !loading &&
    looksLikeEmailQuery(query) &&
    emailIndexLoading &&
    filtered.length === 0 &&
    agents.length > 0;

  const listEmptyVariant = useMemo((): AgentsListEmptyVariant | null => {
    if (loading) return "loading";
    if (searchingByEmail) return "searching";
    if (filtered.length > 0) return null;
    if (error && agents.length === 0) return "error";
    if (agents.length === 0) return "no-agents";
    if (query.trim()) return "no-results";
    if (statusFilter !== "all") return "no-filter";
    return null;
  }, [
    loading,
    searchingByEmail,
    filtered.length,
    error,
    agents.length,
    query,
    statusFilter,
  ]);

  return (
    <div className="org-agents org-agents--split" ref={pageRef}>
      <AuthToast
        message={toastMessage}
        tone={toastTone}
        onDismiss={dismissToast}
      />

      {readOnly ? (
        <div className="banner banner-warn" style={{ marginBottom: 12 }}>
          Viewer — onboard, pause, and delete actions are hidden.
        </div>
      ) : null}

      {topbarSlot
        ? createPortal(
            <label className="org-agents__search-wrap">
              <span className="org-agents__search-icon" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
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
                placeholder="Search by name, email, or ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search agents"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div className="org-agents__actions" aria-label="Agent actions">
              <div className="org-agents__pills" role="group" aria-label="Status filter">
                {STATUS_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    className={`org-agents__pill${statusFilter === pill.id ? " is-active" : ""}`}
                    aria-pressed={statusFilter === pill.id}
                    onClick={() => setStatusFilter(pill.id)}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              {canManage ? (
                <Link className="btn-primary org-agents__cta" to={platformRoute("agents/new")}>
                  Onboard agent
                </Link>
              ) : null}
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="org-split">
        <div className="org-split__list">
          {listEmptyVariant ? (
            <AgentsListEmptyPanel
              variant={listEmptyVariant}
              query={query.trim()}
              statusFilter={statusFilter}
              canManage={canManage}
              onClearSearch={() => setQuery("")}
              onClearFilter={() => setStatusFilter("all")}
              onRetry={() => void load()}
            />
          ) : null}

          {!loading && filtered.length > 0 ? (
            <div className="org-agents__table-panel">
              <div
                ref={tableRef}
                className="org-agents__table-wrap"
                tabIndex={0}
                role="grid"
                aria-label="Agents"
                aria-activedescendant={
                  selectedId ? `org-row-${selectedId}` : undefined
                }
                onKeyDown={(e) => {
                  handleOrgTableKeyDown(e, {
                    filteredIds,
                    selectedId,
                    page,
                    pageSize: PAGE_SIZE,
                    pageCount,
                    onSelect: selectAgent,
                    onPageChange: setPage,
                    tableRef,
                  });
                }}
              >
                <table className="org-agents__table org-agents__table--compact">
                  <colgroup>
                    <col className="org-agents__col-num" />
                    <col className="org-agents__col-name" />
                    <col className="org-agents__col-type" />
                    <col className="org-agents__col-parent" />
                    <col className="org-agents__col-merchants" />
                    <col className="org-agents__col-payout" />
                    <col className="org-agents__col-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="org-agents__th-num">#</th>
                      <SortHeader
                        label="Agent name"
                        sortKey="name"
                        sort={sort}
                        onSort={onSort}
                      />
                      <SortHeader
                        label="Type"
                        sortKey="type"
                        sort={sort}
                        onSort={onSort}
                      />
                      <SortHeader
                        label="Parent"
                        sortKey="parent"
                        sort={sort}
                        onSort={onSort}
                        className="org-agents__th-parent"
                      />
                      <SortHeader
                        label="Merchants"
                        sortKey="merchants"
                        sort={sort}
                        onSort={onSort}
                        className="org-agents__th-merchants"
                        align="end"
                      />
                      <SortHeader
                        label="Payout"
                        sortKey="payout"
                        sort={sort}
                        onSort={onSort}
                        className="org-agents__th-payout"
                      />
                      <SortHeader
                        label="Status"
                        sortKey="status"
                        sort={sort}
                        onSort={onSort}
                        className="org-agents__th-status"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((row, index) => {
                      const status = row.status ?? "active";
                      const parent = row.parentId ? byId.get(row.parentId) : null;
                      const merchantCount = merchantCountByAgent.get(row.id) ?? 0;
                      const payout = payoutByAgentId.get(row.id) ?? null;
                      const isSelected = selectedId === row.id;
                      const rowNum = (page - 1) * PAGE_SIZE + index + 1;
                      return (
                        <tr
                          key={row.id}
                          id={`org-row-${row.id}`}
                          data-org-id={row.id}
                          style={{ animationDelay: `${Math.min(index, 40) * 40}ms` }}
                          className={`org-agents__row${isSelected ? " is-selected" : ""}`}
                          onClick={() => selectAgent(row.id)}
                          aria-selected={isSelected}
                        >
                          <td className="org-agents__idx">{rowNum}</td>
                          <td>
                            <span className="org-agents__name">{row.name}</span>
                          </td>
                          <td>{orgTypeLabel(row.type)}</td>
                          <td className="org-agents__td-parent">
                            <span
                              className="org-agents__parent"
                              title={parent?.name ?? row.parentId ?? undefined}
                            >
                              {parent?.name ?? shortId(row.parentId)}
                            </span>
                          </td>
                          <td className="org-agents__num">{merchantCount}</td>
                          <td className="org-agents__td-payout">
                            {payout ? (
                              <span
                                className={`org-agents__payout is-${payout}`}
                                title="Latest commission statement payout"
                              >
                                {payout === "paid"
                                  ? "Paid"
                                  : payout === "pending"
                                    ? "Pending"
                                    : "Scheduled"}
                              </span>
                            ) : (
                              <span className="muted" title="No commission statements yet">
                                —
                              </span>
                            )}
                          </td>
                          <td className="org-agents__td-status">
                            <span
                              className={`org-agents__status${
                                status === "paused" ? " is-paused" : " is-active"
                              }`}
                            >
                              {status === "paused" ? "Paused" : "Active"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <OrgListPagination
                page={page}
                pageCount={pageCount}
                total={filtered.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </div>

        <div className="org-split__pane">
          {selected ? (
            <AgentDetailCard
              org={selected}
              orgs={orgs}
              canManage={canManage}
              busy={busyId === selected.id}
              invitationSent={inviteState.invitationSent === true}
              inviteCreds={
                inviteState.onboardedOrgId === selected.id
                  ? (inviteState.inviteCreds ?? null)
                  : null
              }
              onPause={() => setSuspendTarget(selected)}
              onRun={() => void onSetStatus(selected, "active")}
              onDelete={() => openDelete(selected)}
            />
          ) : (
            <div className="org-split__empty b3-empty" aria-label="No agent selected">
              <div className="b3-empty__mark" aria-hidden>
                <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                  <rect x="6" y="10" width="14" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="28" y="10" width="14" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
                  <path d="M20 24h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
                </svg>
              </div>
              <p className="b3-empty__title">Agent detail</p>
              <p className="b3-empty__copy">
                Select a row to inspect profile, merchants, volume, and activity.
              </p>
              <ul className="b3-empty__hints">
                <li>Click a row to open overview</li>
                <li>↑↓ move selection · ←→ change page</li>
                <li>Search by name, email, or org ID</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {suspendTarget ? (
        <SuspendOrgModal
          orgName={suspendTarget.name}
          busy={busyId === suspendTarget.id}
          error={suspendError}
          onClose={() => {
            if (busyId !== suspendTarget.id) {
              setSuspendTarget(null);
              setSuspendError(null);
            }
          }}
          onConfirm={(reason) => void confirmSuspend(reason)}
        />
      ) : null}

      {deleteTarget ? (
        <OrgDeleteConfirmModal
          orgId={deleteTarget.id}
          orgName={deleteTarget.name}
          busy={deleteBusy}
          error={deleteError}
          preview={deletePreview}
          previewLoading={deletePreviewLoading}
          onClose={closeDelete}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}
