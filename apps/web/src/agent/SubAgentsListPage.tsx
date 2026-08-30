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
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  looksLikeEmailQuery,
  orgEmailsMapFromBulkRows,
} from "../shared/registeredEmails";
import { scrollOrgSplitPaneIntoView } from "../shared/scrollOrgSplitPane";
import {
  merchantCountsByAgentId,
  merchantOrgIdsInAgentSubtree,
} from "../platform/agentSubtree";
import { OrgListPagination } from "../platform/OrgListPagination";
import { handleOrgTableKeyDown } from "../platform/orgTableKeyboard";
import {
  DEFAULT_AGENT_COMMISSION_PERCENT,
  mergeCommissionHistory,
  resolveAgentPayoutStatus,
  type AgentPayoutStatus,
} from "../platform/orgDetailSeeds";
import { subAgentsInAgentSubtree } from "./agentSubtree";
import {
  ApiError,
  listOrgMemberEmails,
  listOrgs,
  listServiceBills,
  type OrgAccount,
  type ServiceBill,
  type Session,
} from "./api";
import { orgTypeLabel, primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";
import {
  canCreateAgentUnderParent,
  DEFAULT_MAX_AGENT_DEPTH,
} from "../platform/onboardAgent";
import { SubAgentDetailCard } from "./SubAgentDetailCard";

type Props = { session: Session };

type StatusFilter = "all" | "active" | "paused";

type SortKey = "name" | "type" | "parent" | "merchants" | "payout" | "status";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

const PAGE_SIZE = 15;

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
  const ariaSort = active
    ? sort.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th
      className={[
        className,
        active ? "is-sorted" : "",
        align === "end" ? "is-end" : "",
      ]
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

type ListEmptyVariant =
  | "loading"
  | "searching"
  | "no-agents"
  | "no-results"
  | "no-filter"
  | "error";

function SubAgentsListEmptyPanel({
  variant,
  query,
  statusFilter,
  canOnboard,
  canCreateSubAgent,
  onClearSearch,
  onClearFilter,
  onRetry,
}: {
  variant: ListEmptyVariant;
  query?: string;
  statusFilter?: StatusFilter;
  canOnboard?: boolean;
  canCreateSubAgent?: boolean;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
  onRetry?: () => void;
}) {
  const title =
    variant === "loading"
      ? "Loading sub-agents"
      : variant === "searching"
        ? "Searching by email"
        : variant === "no-agents"
          ? "No sub-agent accounts yet"
          : variant === "no-results"
            ? "No matching sub-agents"
            : variant === "no-filter"
              ? `No ${statusFilter === "paused" ? "paused" : "active"} sub-agents`
              : "Could not load sub-agents";

  const copy =
    variant === "loading"
      ? "Fetching agent (sub) accounts in your subtree."
      : variant === "searching"
        ? "Looking up team contact emails across sub-agent orgs."
        : variant === "no-agents"
          ? canCreateSubAgent
            ? "Onboard a sub-agent to expand your channel under this account."
            : `Max agent depth (${DEFAULT_MAX_AGENT_DEPTH}) reached — onboard merchants instead.`
          : variant === "no-results"
            ? query
              ? `Nothing matched “${query}”. Try a different name, email, or org ID.`
              : "Try a different name, email, or org ID."
            : variant === "no-filter"
              ? "Change the status filter or switch back to All to see more accounts."
              : "The sub-agent list could not be loaded. Check your connection and try again.";

  return (
    <div className="org-agents__list-empty b3-empty" role="status">
      <div
        className={`b3-empty__mark${variant === "loading" || variant === "searching" ? " is-busy" : ""}`}
        aria-hidden
      >
        {variant === "loading" || variant === "searching" ? (
          <span className="org-agents__list-empty-spinner" />
        ) : (
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M24 16v10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="24" cy="32" r="1.2" fill="currentColor" />
          </svg>
        )}
      </div>
      <p className="b3-empty__title">{title}</p>
      <p className="b3-empty__copy">{copy}</p>
      <div className="org-agents__list-empty-actions">
        {variant === "no-results" && onClearSearch ? (
          <button
            type="button"
            className="btn-ghost btn-inline"
            onClick={onClearSearch}
          >
            Clear search
          </button>
        ) : null}
        {variant === "no-filter" && onClearFilter ? (
          <button
            type="button"
            className="btn-ghost btn-inline"
            onClick={onClearFilter}
          >
            Show all sub-agents
          </button>
        ) : null}
        {variant === "no-agents" && canOnboard && canCreateSubAgent ? (
          <Link className="btn-primary btn-inline" to="/agent/agents/new">
            Onboard sub-agent
          </Link>
        ) : null}
        {variant === "no-agents" && canOnboard && !canCreateSubAgent ? (
          <Link className="btn-primary btn-inline" to="/agent/merchants/new">
            Onboard merchant
          </Link>
        ) : null}
        {variant === "error" && onRetry ? (
          <button
            type="button"
            className="btn-primary btn-inline"
            onClick={onRetry}
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Agent sub-agents — platform split list + side detail card. */
export function SubAgentsListPage({ session }: Props) {
  const { id: selectedId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canOnboard = useMemo(
    () => sessionCanOnboardMerchant(session),
    [session],
  );

  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const canCreateSubAgent = useMemo(() => {
    if (!agentId || orgs.length === 0) return false;
    return canCreateAgentUnderParent(
      agentId,
      "agent_sub",
      orgs,
      DEFAULT_MAX_AGENT_DEPTH,
    );
  }, [agentId, orgs]);
  const [orgEmailsByOrgId, setOrgEmailsByOrgId] = useState<
    Map<string, string[]>
  >(() => new Map());
  const [emailIndexLoading, setEmailIndexLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("agent-topbar-center"));
    setTopbarActionsSlot(document.getElementById("agent-topbar-actions"));
  }, []);

  useLayoutEffect(() => {
    const pageEl = pageRef.current;
    const main = document.querySelector(".agent-shell .main");
    const topbar = document.querySelector(".agent-shell .topbar");
    if (
      !pageEl ||
      !(main instanceof HTMLElement) ||
      !(topbar instanceof HTMLElement)
    ) {
      return;
    }

    const syncStickyTop = () => {
      const mainTop = main.getBoundingClientRect().top;
      const topbarBottom = topbar.getBoundingClientRect().bottom;
      const stickyTop = Math.max(0, Math.ceil(topbarBottom - mainTop));
      pageEl.style.setProperty("--org-agents-sticky-top", `${stickyTop}px`);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgRows = await listOrgs();
      setOrgs(orgRows);
      setLoading(false);
      const billRows = await listServiceBills().catch(() => [] as ServiceBill[]);
      setBills(billRows);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load sub-agents",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setEmailIndexLoading(true);
    void listOrgMemberEmails()
      .then((rows) => {
        if (!cancelled) setOrgEmailsByOrgId(orgEmailsMapFromBulkRows(rows));
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
  }, []);

  const agents = useMemo(() => {
    if (!agentId) return [];
    return subAgentsInAgentSubtree(agentId, orgs);
  }, [agentId, orgs]);

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
    const emailMode = looksLikeEmailQuery(query);
    let rows = agents;
    if (statusFilter !== "all") {
      rows = rows.filter((o) => (o.status ?? "active") === statusFilter);
    }
    if (q) {
      rows = rows.filter((o) => {
        if (o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)) {
          return true;
        }
        if (!emailMode) return false;
        const emails = orgEmailsByOrgId.get(o.id) ?? [];
        return emails.some((e) => e.toLowerCase().includes(q));
      });
    }

    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      if (sort.key === "name") {
        return a.name.localeCompare(b.name) * dir;
      }
      if (sort.key === "type") {
        const byType =
          orgTypeLabel(a.type).localeCompare(orgTypeLabel(b.type)) * dir;
        return byType !== 0 ? byType : a.name.localeCompare(b.name) * dir;
      }
      if (sort.key === "parent") {
        const ap = a.parentId ? (byId.get(a.parentId)?.name ?? a.parentId) : "";
        const bp = b.parentId ? (byId.get(b.parentId)?.name ?? b.parentId) : "";
        const byParent = ap.localeCompare(bp) * dir;
        return byParent !== 0 ? byParent : a.name.localeCompare(b.name) * dir;
      }
      if (sort.key === "merchants") {
        const ca = merchantCountByAgent.get(a.id) ?? 0;
        const cb = merchantCountByAgent.get(b.id) ?? 0;
        if (ca !== cb) return (ca - cb) * dir;
        return a.name.localeCompare(b.name) * dir;
      }
      if (sort.key === "payout") {
        const pa = payoutSortRank(payoutByAgentId.get(a.id) ?? null);
        const pb = payoutSortRank(payoutByAgentId.get(b.id) ?? null);
        if (pa !== pb) return (pa - pb) * dir;
        return a.name.localeCompare(b.name) * dir;
      }
      const as = a.status ?? "active";
      const bs = b.status ?? "active";
      const byStatus = as.localeCompare(bs) * dir;
      return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name) * dir;
    });
  }, [
    agents,
    query,
    statusFilter,
    sort,
    byId,
    merchantCountByAgent,
    payoutByAgentId,
    orgEmailsByOrgId,
  ]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sort]);

  const onSort = (key: SortKey) => {
    startTransition(() => {
      setSort((prev) => {
        if (prev.key !== key) return { key, dir: "asc" };
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      });
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

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return agents.find((a) => a.id === selectedId) ?? null;
  }, [agents, selectedId]);

  useEffect(() => {
    if (!selectedId || loading) return;
    if (!agents.some((a) => a.id === selectedId)) {
      navigate("/agent/agents", { replace: true });
    }
  }, [selectedId, agents, loading, navigate]);

  useEffect(() => {
    if (!selectedId) return;
    const index = filtered.findIndex((row) => row.id === selectedId);
    if (index === -1) return;
    const targetPage = Math.floor(index / PAGE_SIZE) + 1;
    setPage((current) => (current === targetPage ? current : targetPage));
  }, [selectedId, filtered]);

  const selectAgent = (id: string) => {
    startTransition(() => {
      navigate(`/agent/agents/${id}`);
    });
    tableRef.current?.focus({ preventScroll: true });
    scrollOrgSplitPaneIntoView();
  };

  const searchingByEmail =
    !loading &&
    looksLikeEmailQuery(query) &&
    emailIndexLoading &&
    filtered.length === 0 &&
    agents.length > 0;

  const listEmptyVariant = useMemo((): ListEmptyVariant | null => {
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
        message={error}
        tone="error"
        onDismiss={() => setError(null)}
      />

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
                placeholder="Search by sub-agent name, ID, or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search sub-agents"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div className="org-agents__actions" aria-label="Sub-agent actions">
              <div
                className="org-agents__pills"
                role="group"
                aria-label="Status filter"
              >
                {STATUS_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    className={`org-agents__pill${
                      statusFilter === pill.id ? " is-active" : ""
                    }`}
                    aria-pressed={statusFilter === pill.id}
                    onClick={() => setStatusFilter(pill.id)}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              {canOnboard && canCreateSubAgent ? (
                <Link
                  className="btn-primary org-agents__cta"
                  to="/agent/agents/new"
                >
                  Onboard sub-agent
                </Link>
              ) : canOnboard ? (
                <button
                  type="button"
                  className="btn-primary org-agents__cta"
                  disabled
                  title={`Max agent depth (${DEFAULT_MAX_AGENT_DEPTH}) reached`}
                >
                  Onboard sub-agent
                </button>
              ) : null}
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="org-split">
        <div className="org-split__list">
          {listEmptyVariant ? (
            <SubAgentsListEmptyPanel
              variant={listEmptyVariant}
              query={query.trim()}
              statusFilter={statusFilter}
              canOnboard={canOnboard}
              canCreateSubAgent={canCreateSubAgent}
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
                aria-label="Sub-agents"
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
                      const parent = row.parentId
                        ? byId.get(row.parentId)
                        : null;
                      const merchantCount =
                        merchantCountByAgent.get(row.id) ?? 0;
                      const payout = payoutByAgentId.get(row.id) ?? null;
                      const isSelected = selectedId === row.id;
                      const rowNum = (page - 1) * PAGE_SIZE + index + 1;
                      return (
                        <tr
                          key={row.id}
                          id={`org-row-${row.id}`}
                          data-org-id={row.id}
                          style={{
                            animationDelay: `${Math.min(index, 40) * 40}ms`,
                          }}
                          className={`org-agents__row${
                            isSelected ? " is-selected" : ""
                          }`}
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
                              <span
                                className="muted"
                                title="No commission statements yet"
                              >
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
            <SubAgentDetailCard org={selected} orgs={orgs} />
          ) : (
            <div
              className="org-split__empty b3-empty"
              aria-label="No sub-agent selected"
            >
              <div className="b3-empty__mark" aria-hidden>
                <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                  <rect
                    x="6"
                    y="10"
                    width="14"
                    height="28"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <rect
                    x="28"
                    y="10"
                    width="14"
                    height="28"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    opacity="0.45"
                  />
                  <path
                    d="M20 24h8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="square"
                  />
                </svg>
              </div>
              <p className="b3-empty__title">Sub-agent detail</p>
              <p className="b3-empty__copy">
                Select a row to inspect accounts, bills, and team under this
                sub-agent.
              </p>
              <ul className="b3-empty__hints">
                <li>Click a row to open overview</li>
                <li>↑↓ move selection · ←→ change page</li>
                <li>Search by name, org ID, or email</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
