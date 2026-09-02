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
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getPlatformOrgs,
  getPlatformServiceBills,
  invalidatePlatformOrgList,
  listPlatformOrgMemberEmails,
  peekPlatformOrgs,
  peekPlatformServiceBills,
  setOrgStatus,
  type OrgAccount,
  type ServiceBill,
  type Session,
} from "./api";
import { MerchantDetailCard } from "./MerchantDetailCard";
import { STRUCTURE_LABELS } from "./merchantSubtree";
import { OrgListPagination } from "./OrgListPagination";
import { scrollOrgSplitPaneIntoView } from "../shared/scrollOrgSplitPane";
import { useAutoSelectOrgListRow } from "../shared/useAutoSelectOrgListRow";
import { handleOrgTableKeyDown } from "./orgTableKeyboard";
import { sessionCanIssueServiceBill } from "./org";
import {
  serviceBillStatusLabel,
} from "./serviceBillStatus";
import { SuspendOrgModal } from "./ui/SuspendOrgModal";
import { OrgDeleteConfirmModal } from "./ui/OrgDeleteConfirmModal";
import { useOrgDeleteModal } from "./useOrgDeleteModal";
import {
  looksLikeEmailQuery,
  orgEmailsMapFromBulkRows,
} from "../shared/registeredEmails";
import { platformRoute } from "../shared/portalRouting";

type Props = { session: Session };

type StatusFilter = "all" | "active" | "paused";

/** Open / latest service-bill status shown on the merchants list. */
type MerchantBillStatus = "overdue" | "issued" | "paid";

type SortKey = "name" | "structure" | "parent" | "bill" | "status";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

const PAGE_SIZE = 20;

const BILL_SORT_RANK: Record<MerchantBillStatus, number> = {
  overdue: 0,
  issued: 1,
  paid: 2,
};

function billSortRank(status: MerchantBillStatus | null): number {
  if (!status) return 3;
  return BILL_SORT_RANK[status];
}

/**
 * Prefer collection risk: overdue → issued → latest paid. Voided ignored.
 */
function resolveMerchantBillStatus(
  bills: ServiceBill[],
): MerchantBillStatus | null {
  let hasIssued = false;
  let hasPaid = false;
  for (const bill of bills) {
    if (bill.status === "overdue") return "overdue";
    if (bill.status === "issued") hasIssued = true;
    else if (bill.status === "paid") hasPaid = true;
  }
  if (hasIssued) return "issued";
  if (hasPaid) return "paid";
  return null;
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

type MerchantsListEmptyVariant =
  | "loading"
  | "searching"
  | "no-merchants"
  | "no-results"
  | "no-filter"
  | "error";

function MerchantsListEmptyPanel({
  variant,
  query,
  statusFilter,
  canManage,
  onClearSearch,
  onClearFilter,
  onRetry,
}: {
  variant: MerchantsListEmptyVariant;
  query?: string;
  statusFilter?: StatusFilter;
  canManage?: boolean;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
  onRetry?: () => void;
}) {
  const title =
    variant === "loading"
      ? "Loading merchants"
      : variant === "searching"
        ? "Searching by email"
        : variant === "no-merchants"
          ? "No merchant accounts yet"
          : variant === "no-results"
            ? "No matching merchants"
            : variant === "no-filter"
              ? `No ${statusFilter === "paused" ? "paused" : "active"} merchants`
              : "Could not load merchants";

  const copy =
    variant === "loading"
      ? "Fetching merchant accounts from the platform."
      : variant === "searching"
        ? "Looking up team contact emails across merchant orgs."
        : variant === "no-merchants"
          ? "Add a merchant to start accepting crypto payment orders."
          : variant === "no-results"
            ? query
              ? `Nothing matched “${query}”. Try a different name, email, or org ID.`
              : "Try a different name, email, or org ID."
          : variant === "no-filter"
            ? "Change the status filter or switch back to All to see more accounts."
            : "The merchant list could not be loaded. Check your connection and try again.";

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
            <path
              d="M10 34V14l14-6 14 6v20"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M18 34V22l6-3 6 3v12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              opacity="0.55"
            />
            <path
              d="M24 8v6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <p className="b3-empty__title">{title}</p>
      <p className="b3-empty__copy">{copy}</p>
      {variant === "no-merchants" ? (
        <ul className="b3-empty__hints">
          <li>Merchants receive on-chain payments to their own addresses</li>
          <li>Assign matching mode and settlement in the merchant portal</li>
        </ul>
      ) : variant === "no-results" || variant === "searching" ? (
        <ul className="b3-empty__hints">
          <li>Search by merchant name, org ID, or contact email (use @)</li>
          <li>Filter by Active or Paused in the top bar</li>
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
            Show all merchants
          </button>
        ) : null}
        {variant === "no-merchants" && canManage ? (
          <Link className="btn-primary btn-inline" to={platformRoute("merchants/new")}>
            Onboard merchant
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

/** B5 — Merchants list: half-width table + side detail card. */
export function MerchantsListPage({ session }: Props) {
  const { id: selectedId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const detailTab = searchParams.get("tab") ?? undefined;
  const canManage = useMemo(() => sessionCanIssueServiceBill(session), [session]);
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
    onDeleted: async () => {
      invalidatePlatformOrgList();
      try {
        const next = await getPlatformOrgs({ force: true });
        setOrgs(next);
        if (selectedId && !next.some((o) => o.id === selectedId)) clearSelection();
      } catch {
        /* ignore */
      }
    },
    showOk,
  });

  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
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

  const load = useCallback(async () => {
    const hasCachedOrgs = peekPlatformOrgs() != null;
    // Paint merchants as soon as orgs are ready; bills only feed Bill column.
    if (!hasCachedOrgs) setLoading(true);
    setError(null);
    try {
      const orgRows = await getPlatformOrgs();
      setOrgs(orgRows);
      setLoading(false);
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
          : "Failed to load merchants";
      showErr(text);
    } finally {
      setLoading(false);
    }
  }, [showErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const merchants = useMemo(
    () => orgs.filter((o) => o.type === "merchant"),
    [orgs],
  );

  const billStatusByMerchantId = useMemo(() => {
    const byOrg = new Map<string, ServiceBill[]>();
    for (const bill of bills) {
      const list = byOrg.get(bill.orgId);
      if (list) list.push(bill);
      else byOrg.set(bill.orgId, [bill]);
    }
    const map = new Map<string, MerchantBillStatus | null>();
    for (const m of merchants) {
      map.set(m.id, resolveMerchantBillStatus(byOrg.get(m.id) ?? []));
    }
    return map;
  }, [bills, merchants]);

  const merchantIdsKey = useMemo(
    () => merchants.map((m) => m.id).sort().join("|"),
    [merchants],
  );

  useEffect(() => {
    if (!looksLikeEmailQuery(query)) {
      setOrgEmailsByOrgId(new Map());
      setEmailIndexLoading(false);
      return;
    }
    if (merchants.length === 0) return;

    let cancelled = false;
    setEmailIndexLoading(true);

    void listPlatformOrgMemberEmails({ types: ["merchant"] })
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
  }, [merchantIdsKey, merchants.length, query]);

  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = merchants.filter((o) => {
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
      if (sort.key === "structure") {
        const sa = a.structure
          ? (STRUCTURE_LABELS[a.structure] ?? a.structure)
          : "";
        const sb = b.structure
          ? (STRUCTURE_LABELS[b.structure] ?? b.structure)
          : "";
        const byStructure = dir * sa.localeCompare(sb);
        return byStructure !== 0 ? byStructure : dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "parent") {
        const pa = a.parentId ? (byId.get(a.parentId)?.name ?? a.parentId) : "";
        const pb = b.parentId ? (byId.get(b.parentId)?.name ?? b.parentId) : "";
        const byParent = dir * pa.localeCompare(pb);
        return byParent !== 0 ? byParent : dir * a.name.localeCompare(b.name);
      }
      if (sort.key === "bill") {
        const ba = billSortRank(billStatusByMerchantId.get(a.id) ?? null);
        const bb = billSortRank(billStatusByMerchantId.get(b.id) ?? null);
        if (ba !== bb) return dir * (ba - bb);
        return dir * a.name.localeCompare(b.name);
      }
      const sa = a.status ?? "active";
      const sb = b.status ?? "active";
      const byStatus = dir * sa.localeCompare(sb);
      return byStatus !== 0 ? byStatus : dir * a.name.localeCompare(b.name);
    });
  }, [
    merchants,
    query,
    statusFilter,
    sort,
    byId,
    billStatusByMerchantId,
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
  const merchantIds = useMemo(() => merchants.map((row) => row.id), [merchants]);

  useAutoSelectOrgListRow({
    selectedId,
    loading,
    allIds: merchantIds,
    filteredIds,
    basePath: platformRoute("merchants"),
    navigate,
    emailIndexLoading,
    query,
  });

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return merchants.find((m) => m.id === selectedId) ?? null;
  }, [merchants, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const index = filtered.findIndex((row) => row.id === selectedId);
    if (index === -1) return;
    const targetPage = Math.floor(index / PAGE_SIZE) + 1;
    setPage((current) => (current === targetPage ? current : targetPage));
  }, [selectedId, filtered]);

  const selectMerchant = (id: string) => {
    navigate(platformRoute(`merchants/${id}`));
    tableRef.current?.focus({ preventScroll: true });
    scrollOrgSplitPaneIntoView();
  };

  const clearSelection = () => {
    navigate(platformRoute("merchants"));
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
    merchants.length > 0;

  const listEmptyVariant = useMemo((): MerchantsListEmptyVariant | null => {
    if (loading) return "loading";
    if (searchingByEmail) return "searching";
    if (filtered.length > 0) return null;
    if (error && merchants.length === 0) return "error";
    if (merchants.length === 0) return "no-merchants";
    if (query.trim()) return "no-results";
    if (statusFilter !== "all") return "no-filter";
    return null;
  }, [
    loading,
    searchingByEmail,
    filtered.length,
    error,
    merchants.length,
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
                placeholder="Search by merchant name, ID, or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search merchants"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div className="org-agents__actions" aria-label="Merchant actions">
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
                <Link className="btn-primary org-agents__cta" to={platformRoute("merchants/new")}>
                  Onboard merchant
                </Link>
              ) : null}
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="org-split">
        <div className="org-split__list">
          {listEmptyVariant ? (
            <MerchantsListEmptyPanel
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
                aria-label="Merchants"
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
                    onSelect: selectMerchant,
                    onPageChange: setPage,
                    tableRef,
                  });
                }}
              >
                <table className="org-agents__table org-agents__table--compact">
                  <colgroup>
                    <col className="org-agents__col-num" />
                    <col className="org-agents__col-name" />
                    <col className="org-agents__col-structure" />
                    <col className="org-agents__col-parent" />
                    <col className="org-agents__col-bill" />
                    <col className="org-agents__col-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="org-agents__th-num">#</th>
                      <SortHeader
                        label="Merchant name"
                        sortKey="name"
                        sort={sort}
                        onSort={onSort}
                      />
                      <SortHeader
                        label="Structure"
                        sortKey="structure"
                        sort={sort}
                        onSort={onSort}
                        className="org-agents__th-structure"
                      />
                      <SortHeader
                        label="Parent"
                        sortKey="parent"
                        sort={sort}
                        onSort={onSort}
                        className="org-agents__th-parent"
                      />
                      <SortHeader
                        label="Bill"
                        sortKey="bill"
                        sort={sort}
                        onSort={onSort}
                        className="org-agents__th-bill"
                      />
                      <SortHeader
                        label="Status"
                        sortKey="status"
                        sort={sort}
                        onSort={onSort}
                        className="org-agents__th-status"
                        align="end"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((row, index) => {
                      const status = row.status ?? "active";
                      const billStatus = billStatusByMerchantId.get(row.id) ?? null;
                      const parent = row.parentId ? byId.get(row.parentId) : null;
                      const isSelected = selectedId === row.id;
                      const rowNum = (page - 1) * PAGE_SIZE + index + 1;
                      return (
                        <tr
                          key={row.id}
                          id={`org-row-${row.id}`}
                          data-org-id={row.id}
                          style={{ animationDelay: `${Math.min(index, 40) * 40}ms` }}
                          className={`org-agents__row${isSelected ? " is-selected" : ""}`}
                          onClick={() => selectMerchant(row.id)}
                          aria-selected={isSelected}
                        >
                          <td className="org-agents__idx">{rowNum}</td>
                          <td>
                            <span className="org-agents__name">{row.name}</span>
                          </td>
                          <td className="org-agents__td-structure">
                            {row.structure
                              ? (STRUCTURE_LABELS[row.structure] ?? row.structure)
                              : "—"}
                          </td>
                          <td className="org-agents__td-parent">
                            <span
                              className="org-agents__parent"
                              title={parent?.name ?? row.parentId ?? undefined}
                            >
                              {parent?.name ?? shortId(row.parentId)}
                            </span>
                          </td>
                          <td className="org-agents__td-bill">
                            {billStatus ? (
                              <span
                                className={`org-agents__bill is-${billStatus}${
                                  billStatus === "overdue" ? " is-pulse" : ""
                                }`}
                                title="Open / latest service bill"
                              >
                                {serviceBillStatusLabel(billStatus)}
                              </span>
                            ) : (
                              <span
                                className="muted"
                                title="No service bill issued yet"
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
            <MerchantDetailCard
              org={selected}
              orgs={orgs}
              session={session}
              canManage={canManage}
              busy={busyId === selected.id}
              initialTab={
                detailTab === "overview" ||
                detailTab === "sites" ||
                detailTab === "settlement" ||
                detailTab === "service-bills" ||
                detailTab === "compliance"
                  ? detailTab
                  : undefined
              }
              onPause={() => setSuspendTarget(selected)}
              onRun={() => void onSetStatus(selected, "active")}
              onDelete={() => openDelete(selected)}
              onOrgPatched={(next) => {
                setOrgs((prev) =>
                  prev.map((o) => (o.id === next.id ? { ...o, ...next } : o)),
                );
              }}
            />
          ) : (
            <div className="org-split__empty b3-empty" aria-label="No merchant selected">
              <div className="b3-empty__mark" aria-hidden>
                <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                  <rect x="6" y="10" width="14" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="28" y="10" width="14" height="28" rx="1.5" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
                  <path d="M20 24h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
                </svg>
              </div>
              <p className="b3-empty__title">Merchant detail</p>
              <p className="b3-empty__copy">
                Select a row to inspect structure, fees, settlement, and orders.
              </p>
              <ul className="b3-empty__hints">
                <li>Click a row to open overview</li>
                <li>↑↓ move selection · ←→ change page</li>
                <li>Search by name or org ID</li>
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
