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
import { agentRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import {
  looksLikeEmailQuery,
  orgEmailsMapFromBulkRows,
} from "../shared/registeredEmails";
import { scrollOrgSplitPaneIntoView } from "../shared/scrollOrgSplitPane";
import { useAutoSelectOrgListRow } from "../shared/useAutoSelectOrgListRow";
import { OrgListPagination } from "../platform/OrgListPagination";
import { handleOrgTableKeyDown } from "../platform/orgTableKeyboard";
import { serviceBillStatusLabel } from "../platform/serviceBillStatus";
import { tierLabel } from "../commercialLabels";
import { FundAmount } from "../platform/FundAmount";
import { merchantsInAgentSubtree } from "./agentSubtree";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import {
  getAgentServiceBills,
  peekAgentServiceBills,
} from "./agentServiceBillsList";
import {
  ApiError,
  getOrderSummary,
  listMerchantCommercialSummaries,
  listOrgMemberEmails,
  type MerchantCommercialSettings,
  type OrgAccount,
  type ServiceBill,
  type Session,
} from "./api";
import { MerchantDetailCard } from "./MerchantDetailCard";
import { STRUCTURE_LABELS } from "./onboardMerchant";
import { primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";

type Props = { session: Session };

type StatusFilter = "all" | "active" | "paused";

type MerchantBillStatus = "overdue" | "issued" | "paid";

type SortKey =
  | "name"
  | "tier"
  | "structure"
  | "fee"
  | "volume"
  | "bill"
  | "status";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

const PAGE_SIZE = 15;

const BILL_SORT_RANK: Record<MerchantBillStatus, number> = {
  overdue: 0,
  issued: 1,
  paid: 2,
};

function billSortRank(status: MerchantBillStatus | null): number {
  if (!status) return 3;
  return BILL_SORT_RANK[status];
}

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

const STATUS_PILLS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

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
  canOnboard,
  onClearSearch,
  onClearFilter,
  onRetry,
}: {
  variant: MerchantsListEmptyVariant;
  query?: string;
  statusFilter?: StatusFilter;
  canOnboard?: boolean;
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
      ? "Fetching merchant accounts in your subtree."
      : variant === "searching"
        ? "Looking up team contact emails across merchant orgs."
        : variant === "no-merchants"
          ? "Onboard a merchant to start collecting under your channel."
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
          <span className="org-agents__list-empty-spinner" />
        ) : variant === "no-results" ? (
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M27 27 36 36"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
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
            Show all merchants
          </button>
        ) : null}
        {variant === "no-merchants" && canOnboard ? (
          <Link className="btn-primary btn-inline" to={agentRoute("merchants/new")}>
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

/** Agent merchants — platform split list + side detail card. */
export function MerchantsListPage({ session }: Props) {
  const { id: selectedId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const detailTab = searchParams.get("tab") ?? undefined;
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canOnboard = useMemo(
    () => sessionCanOnboardMerchant(session),
    [session],
  );

  const [orgs, setOrgs] = useState<OrgAccount[]>(() => peekAgentOrgs() ?? []);
  const [bills, setBills] = useState<ServiceBill[]>(
    () => peekAgentServiceBills() ?? [],
  );
  const [volumeByOrg, setVolumeByOrg] = useState<
    { orgId: string; volume: string }[]
  >([]);
  const [commercialById, setCommercialById] = useState<
    Map<string, MerchantCommercialSettings>
  >(() => new Map());
  const [orgEmailsByOrgId, setOrgEmailsByOrgId] = useState<
    Map<string, string[]>
  >(() => new Map());
  const [emailIndexLoading, setEmailIndexLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(() => peekAgentOrgs() == null);
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
      const [orgRows, billRows, summary] = await Promise.all([
        getAgentOrgs(),
        getAgentServiceBills().catch(() => [] as ServiceBill[]),
        getOrderSummary(
          new Date(Date.now() - 90 * 86400000).toISOString(),
          new Date().toISOString(),
        ).catch(() => null),
      ]);
      setOrgs(orgRows);
      setBills(billRows);
      setVolumeByOrg(summary?.volumeByOrg ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load merchants",
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

  const merchants = useMemo(() => {
    if (!agentId) return [];
    return merchantsInAgentSubtree(agentId, orgs).filter(
      (o) => o.type === "merchant",
    );
  }, [agentId, orgs]);

  useEffect(() => {
    let cancelled = false;
    if (merchants.length === 0) {
      setCommercialById(new Map());
      return;
    }
    void listMerchantCommercialSummaries(merchants.map((m) => m.id))
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, MerchantCommercialSettings>();
        for (const row of rows) map.set(row.orgId, row);
        setCommercialById(map);
      })
      .catch(() => {
        if (!cancelled) setCommercialById(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [merchants]);

  const volumeByMerchantId = useMemo(() => {
    const byIdLocal = new Map(orgs.map((o) => [o.id, o]));
    const map = new Map<string, number>();
    for (const row of volumeByOrg) {
      let merchantId = row.orgId;
      const org = byIdLocal.get(row.orgId);
      if (org?.type === "merchant_site" && org.parentId) {
        merchantId = org.parentId;
      }
      const n = Number(row.volume);
      if (!Number.isFinite(n)) continue;
      map.set(merchantId, (map.get(merchantId) ?? 0) + n);
    }
    return map;
  }, [volumeByOrg, orgs]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const emailMode = looksLikeEmailQuery(query);
    let rows = merchants;
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
      if (sort.key === "tier") {
        const at = commercialById.get(a.id)?.tier ?? "";
        const bt = commercialById.get(b.id)?.tier ?? "";
        return at.localeCompare(bt) * dir;
      }
      if (sort.key === "structure") {
        const as = a.structure ?? "";
        const bs = b.structure ?? "";
        return as.localeCompare(bs) * dir;
      }
      if (sort.key === "fee") {
        const af = Number(commercialById.get(a.id)?.volumeFeePercent ?? NaN);
        const bf = Number(commercialById.get(b.id)?.volumeFeePercent ?? NaN);
        const an = Number.isFinite(af) ? af : -1;
        const bn = Number.isFinite(bf) ? bf : -1;
        return (an - bn) * dir;
      }
      if (sort.key === "volume") {
        return (
          ((volumeByMerchantId.get(a.id) ?? 0) -
            (volumeByMerchantId.get(b.id) ?? 0)) *
          dir
        );
      }
      if (sort.key === "bill") {
        return (
          (billSortRank(billStatusByMerchantId.get(a.id) ?? null) -
            billSortRank(billStatusByMerchantId.get(b.id) ?? null)) *
          dir
        );
      }
      const as = a.status ?? "active";
      const bs = b.status ?? "active";
      return as.localeCompare(bs) * dir;
    });
  }, [
    merchants,
    query,
    statusFilter,
    sort,
    billStatusByMerchantId,
    orgEmailsByOrgId,
    commercialById,
    volumeByMerchantId,
  ]);

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
    basePath: agentRoute("merchants"),
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
    navigate(agentRoute(`merchants/${id}`));
    tableRef.current?.focus({ preventScroll: true });
    scrollOrgSplitPaneIntoView();
  };

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
              {canOnboard ? (
                <Link
                  className="btn-primary org-agents__cta"
                  to={agentRoute("merchants/new")}
                >
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
              canOnboard={canOnboard}
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
                    <col className="org-agents__col-tier" />
                    <col className="org-agents__col-structure" />
                    <col className="org-agents__col-fee" />
                    <col className="org-agents__col-volume" />
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
                        label="Tier"
                        sortKey="tier"
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
                        label="Fee %"
                        sortKey="fee"
                        sort={sort}
                        onSort={onSort}
                      />
                      <SortHeader
                        label="Volume"
                        sortKey="volume"
                        sort={sort}
                        onSort={onSort}
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
                      const billStatus =
                        billStatusByMerchantId.get(row.id) ?? null;
                      const commercial = commercialById.get(row.id);
                      const volume = volumeByMerchantId.get(row.id) ?? 0;
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
                          onClick={() => selectMerchant(row.id)}
                          aria-selected={isSelected}
                        >
                          <td className="org-agents__idx">{rowNum}</td>
                          <td>
                            <span className="org-agents__name">{row.name}</span>
                          </td>
                          <td>
                            {commercial ? tierLabel(commercial.tier) : "—"}
                          </td>
                          <td className="org-agents__td-structure">
                            {row.structure
                              ? (STRUCTURE_LABELS[
                                  row.structure as keyof typeof STRUCTURE_LABELS
                                ] ?? row.structure)
                              : "—"}
                          </td>
                          <td>
                            {commercial
                              ? `${commercial.volumeFeePercent}%`
                              : "—"}
                          </td>
                          <td>
                            <FundAmount amount={volume} />
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
              canEditCommercial={canOnboard}
              initialTab={detailTab}
            />
          ) : (
            <div
              className="org-split__empty b3-empty"
              aria-label="No merchant selected"
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
              <p className="b3-empty__title">Merchant detail</p>
              <p className="b3-empty__copy">
                Select a row to inspect structure, fees, and service bills.
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
