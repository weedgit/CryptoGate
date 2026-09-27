import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { formatViewerDateTime, utcMidnightLabel } from "../shared/dateTime";
import { formatCommissionPeriodLabel } from "../commercial/commissionStatements";
import { truncateAddress } from "./orgDetailSeeds";
import { displayServiceBillTxHash } from "../shared/serviceBillPeriod";
import {
  generateCommissionInvoices,
  defaultCommissionPeriodKey,
  findPayout,
  markCommissionPayoutsPaidBatch,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import { BulkMarkPaidModal } from "./BulkMarkPaidModal";
import {
  formatCommissionPaidAgingHint,
} from "../commercial/commissionAging";
import {
  remittanceNetwork,
  displayCommissionInvoiceId,
} from "../commercial/commissionInvoiceShared";
import {
  ApiError,
  getBillingCalendarSettings,
  listAuditLog,
  type AuditLogEntry,
  type BillingCalendarSettings,
  type Session,
} from "./api";
import { getPlatformOrgs, peekPlatformOrgs } from "./platformOrgList";
import { platformRoute } from "../shared/portalRouting";
import { useCommissionsPortal } from "./commissionsPortal";
import { FundAmount } from "./FundAmount";
import { OrgListPagination } from "./OrgListPagination";
import { sessionCanIssueServiceBill, sessionIsPlatformViewerOnly } from "./org";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { PagePending } from "./ui/PlatformPending";
import {
  getCommissionPayoutsSummary,
  listCommissionPayoutsServer,
  peekCommissionPayoutsServer,
  peekCommissionPayoutsSummary,
  type CommissionPayoutSortKey,
  type CommissionPayoutsListParams,
  type CommissionPayoutsSummary,
} from "../shared/commissionsServer";
import { invalidateServerJson, type ServerPage } from "../shared/serverListApi";
import { useDebouncedValue } from "../shared/useDebouncedValue";
import {
  SortHeader,
  toggleSortState,
  type SortState,
} from "./ui/TableArrange";

type StatusFilter = "all" | "issued" | "paid" | "settled";

type StatusNavItem = {
  id: StatusFilter;
  label: string;
  children?: StatusNavItem[];
};

type InvoiceSortKey =
  | "period"
  | "agent"
  | "fee"
  | "rate"
  | "commission"
  | "status"
  | "tx"
  | "paidAt";

type HistorySortKey =
  | "paidAt"
  | "period"
  | "agent"
  | "amount"
  | "address"
  | "tx"
  | "status";

type Props = { session: Session };

const STATUS_NAV: StatusNavItem[] = [
  {
    id: "all",
    label: "All",
    children: [
      { id: "issued", label: "Issued" },
      { id: "paid", label: "Awaiting" },
      { id: "settled", label: "Settled" },
    ],
  },
];

const PAGE_SIZE = 10;
/** Server cap for POST /commission-payouts/mark-paid-batch. */
const BATCH_MARK_PAID_MAX = 50;
const PERIOD_KEY_RE = /^\d{4}-\d{2}$/;

function statusNavContains(
  item: StatusNavItem,
  filter: StatusFilter,
): boolean {
  if (item.id === filter) return true;
  return Boolean(item.children?.some((child) => statusNavContains(child, filter)));
}

const HISTORY_SORT_SERVER: Record<HistorySortKey, CommissionPayoutSortKey> = {
  paidAt: "settledAt",
  period: "period",
  agent: "agent",
  amount: "commission",
  address: "address",
  tx: "tx",
  status: "status",
};

function listStatusForView(status: StatusFilter): string | string[] {
  if (status === "settled") return "settled";
  if (status === "issued") return "issued";
  if (status === "paid") return "paid";
  return ["issued", "paid", "settled"];
}

function formatLastAutoRunBanner(entry: AuditLogEntry | null): string {
  if (!entry) return "Last auto run: never";
  const meta = entry.metadata ?? {};
  const when = formatViewerDateTime(entry.createdAt);
  const created = typeof meta.created === "number" ? meta.created : 0;
  return `Last auto run: ${when} · ${created} created`;
}

function formatMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return ym || "Select month";
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return ym;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function parseYearMonth(ym: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

function utcMonthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function CommissionPeriodPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const parsed = parseYearMonth(value);
  const [viewYear, setViewYear] = useState(
    () => parsed?.year ?? new Date().getUTCFullYear(),
  );

  useEffect(() => {
    if (!open) return;
    setViewYear(parsed?.year ?? new Date().getUTCFullYear());
  }, [open, parsed?.year]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="plat-commissions__period-picker">
      <button
        type="button"
        className={`plat-commissions__period-field${open ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Invoice billing period"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="plat-commissions__period-label">
          {formatMonthLabel(value)}
        </span>
        <span className="plat-commissions__period-chevron" aria-hidden>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <rect
              x="2.25"
              y="3.25"
              width="11.5"
              height="10.5"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.35"
            />
            <path
              d="M2.25 6.75h11.5M5.25 2v2.75M10.75 2v2.75"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      {open ? (
        <div
          className="plat-commissions__period-menu"
          role="dialog"
          aria-label="Choose billing period"
        >
          <div className="plat-commissions__period-menu-head">
            <button
              type="button"
              className="plat-commissions__period-year-btn"
              aria-label="Previous year"
              onClick={() => setViewYear((y) => y - 1)}
            >
              ‹
            </button>
            <span className="plat-commissions__period-year">{viewYear}</span>
            <button
              type="button"
              className="plat-commissions__period-year-btn"
              aria-label="Next year"
              onClick={() => setViewYear((y) => y + 1)}
            >
              ›
            </button>
          </div>
          <div className="plat-commissions__period-months" role="listbox">
            {MONTH_SHORT.map((label, index) => {
              const month = index + 1;
              const ym = `${viewYear}-${String(month).padStart(2, "0")}`;
              const selected = ym === value;
              return (
                <button
                  key={ym}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`plat-commissions__period-month${
                    selected ? " is-selected" : ""
                  }`}
                  onClick={() => {
                    onChange(ym);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="plat-commissions__period-menu-foot">
            <button
              type="button"
              className="plat-commissions__period-foot-btn"
              onClick={() => {
                onChange(defaultCommissionPeriodKey());
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="plat-commissions__period-foot-btn"
              onClick={() => {
                onChange(utcMonthKey());
                setOpen(false);
              }}
            >
              This month
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseStatusFilter(
  statusRaw: string | null,
  tabRaw: string | null,
): StatusFilter {
  if (
    statusRaw === "all" ||
    statusRaw === "issued" ||
    statusRaw === "paid" ||
    statusRaw === "settled"
  ) {
    return statusRaw;
  }
  if (tabRaw === "history") return "settled";
  return "all";
}

function commissionBadgeTone(status: string): string {
  if (status === "issued") return "warn";
  if (status === "paid") return "teal";
  if (status === "settled") return "ok";
  return "muted";
}

function commissionStatusLabel(status: string): string {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Awaiting";
  if (status === "settled") return "Settled";
  return status;
}

function orgIconMap(
  orgs: { id: string; iconKey?: string | null }[],
): Map<string, string | null> {
  return new Map(orgs.map((o) => [o.id, o.iconKey ?? null]));
}

function AgentOrgAvatar({
  name,
  iconKey,
}: {
  name: string;
  iconKey?: string | null;
}) {
  return (
    <OrgBrandMark
      name={name}
      iconKey={iconKey}
      size={36}
      className="plat-bills__merchant-avatar plat-bills__merchant-avatar--brand"
    />
  );
}

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

function RowMoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <circle cx="8" cy="3.5" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="8" cy="12.5" r="1.35" />
    </svg>
  );
}

/** B12 — Platform → agent monthly commission invoices & payout history. */
export function PlatformCommissionsPage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputId = useId();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get("status"), searchParams.get("tab")),
  );
  const portal = useCommissionsPortal();
  const route = portal?.route ?? platformRoute;
  const peekOrgs = portal?.peekOrgs ?? peekPlatformOrgs;
  const payeeScope = useMemo(
    () => (portal?.payeeOrgId ? { payeeOrgId: portal.payeeOrgId } : {}),
    [portal],
  );
  const canPay = useMemo(
    () => (portal ? false : sessionCanIssueServiceBill(session)),
    [portal, session],
  );
  const isViewer = useMemo(
    () => (portal ? portal.readOnly : sessionIsPlatformViewerOnly(session)),
    [portal, session],
  );

  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [generatePeriod, setGeneratePeriod] = useState(() =>
    defaultCommissionPeriodKey(),
  );
  const [busy, setBusy] = useState(false);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [billingCalendar, setBillingCalendar] =
    useState<BillingCalendarSettings | null>(null);
  const [lastAutoRun, setLastAutoRun] = useState<AuditLogEntry | null>(null);
  const [orgIcons, setOrgIcons] = useState<Map<string, string | null>>(() => {
    const cached = peekOrgs();
    return cached ? orgIconMap(cached) : new Map();
  });
  const [invoiceSort, setInvoiceSort] = useState<SortState<InvoiceSortKey>>({
    key: "period",
    dir: "desc",
  });
  const [historySort, setHistorySort] = useState<SortState<HistorySortKey>>({
    key: "paidAt",
    dir: "desc",
  });
  const [query, setQuery] = useState("");

  const dismissToast = useCallback(() => {
    setError(null);
    setOkMessage(null);
  }, []);

  const loadLastAutoRun = useCallback(async () => {
    if (portal) return;
    try {
      const items = await listAuditLog({
        action: "commission_payout_auto",
        limit: 1,
      });
      setLastAutoRun(items[0] ?? null);
    } catch {
      /* optional ops banner */
    }
  }, [portal]);

  const deepLinkPayee = searchParams.get("payee");
  const deepLinkPeriod = searchParams.get("period");
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null);

  useEffect(() => {
    if (!deepLinkPayee || !deepLinkPeriod || !PERIOD_KEY_RE.test(deepLinkPeriod)) {
      setDeepLinkId(null);
      return;
    }
    let cancelled = false;
    void findPayout(deepLinkPayee, deepLinkPeriod)
      .then((p) => {
        if (!cancelled) setDeepLinkId(p?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setDeepLinkId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [deepLinkPayee, deepLinkPeriod]);

  useEffect(() => {
    if (portal) return;
    let cancelled = false;
    void getBillingCalendarSettings()
      .then((settings) => {
        if (!cancelled) setBillingCalendar(settings);
      })
      .catch(() => {
        /* optional */
      });
    void loadLastAutoRun();
    return () => {
      cancelled = true;
    };
  }, [loadLastAutoRun, portal]);

  const writeSearchParams = useCallback(
    (next: { status?: StatusFilter }) => {
      const params = new URLSearchParams();
      const nextStatus = next.status ?? statusFilter;
      if (nextStatus !== "all") params.set("status", nextStatus);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams, statusFilter],
  );

  function selectStatus(next: StatusFilter) {
    setStatusFilter(next);
    writeSearchParams({ status: next });
  }

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
  }, []);

  const showOpenInvoices = statusFilter !== "settled";
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const filterKey = showOpenInvoices
    ? `${statusFilter}|${debouncedQuery}|${invoiceSort.key}|${invoiceSort.dir}`
    : `${statusFilter}|${debouncedQuery}|${historySort.key}|${historySort.dir}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = useCallback(
    (next: number) => setPageState({ key: filterKey, page: next }),
    [filterKey],
  );

  const canBulkPay = canPay && !isViewer && showOpenInvoices;
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>(
    () => ({ key: filterKey, ids: new Set() }),
  );
  const selectedIds = useMemo(
    () => (selection.key === filterKey ? selection.ids : new Set<string>()),
    [selection, filterKey],
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const toggleSelected = useCallback(
    (ids: string[], on: boolean) => {
      setSelection((prev) => {
        const next = new Set(prev.key === filterKey ? prev.ids : []);
        for (const id of ids) {
          if (!on) next.delete(id);
          else if (next.size < BATCH_MARK_PAID_MAX) next.add(id);
        }
        return { key: filterKey, ids: next };
      });
    },
    [filterKey],
  );
  const clearSelection = useCallback(
    () => setSelection({ key: filterKey, ids: new Set() }),
    [filterKey],
  );

  const listParams = useMemo<CommissionPayoutsListParams>(() => {
    const base = {
      ...payeeScope,
      status: listStatusForView(statusFilter),
      q: debouncedQuery || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    return showOpenInvoices
      ? { ...base, sort: invoiceSort.key, dir: invoiceSort.dir, agingFirst: true }
      : {
          ...base,
          sort: HISTORY_SORT_SERVER[historySort.key],
          dir: historySort.dir,
        };
  }, [
    payeeScope,
    statusFilter,
    debouncedQuery,
    page,
    showOpenInvoices,
    invoiceSort,
    historySort,
  ]);

  const [pageData, setPageData] =
    useState<ServerPage<CommissionPayoutRecord> | null>(() =>
      peekCommissionPayoutsServer(listParams),
    );
  const [summary, setSummary] = useState<CommissionPayoutsSummary | null>(() =>
    peekCommissionPayoutsSummary(payeeScope),
  );
  const [fetching, setFetching] = useState(false);
  const listSeq = useRef(0);
  const summarySeq = useRef(0);

  const reportError = useCallback((err: unknown, fallback: string) => {
    setError(
      err instanceof ApiError
        ? err.code === "rate_limited"
          ? "Too many requests — wait a moment and retry."
          : err.message
        : err instanceof Error
          ? err.message
          : fallback,
    );
  }, []);

  const loadList = useCallback(
    async (params: CommissionPayoutsListParams) => {
      const seq = ++listSeq.current;
      const cached = peekCommissionPayoutsServer(params);
      if (cached) setPageData(cached);
      setFetching(true);
      try {
        const result = await listCommissionPayoutsServer(params);
        if (seq === listSeq.current) setPageData(result);
      } catch (err) {
        if (seq === listSeq.current) {
          reportError(err, "Failed to load commission invoices");
        }
      } finally {
        if (seq === listSeq.current) setFetching(false);
      }
    },
    [reportError],
  );

  const loadSummary = useCallback(async () => {
    const seq = ++summarySeq.current;
    const cached = peekCommissionPayoutsSummary(payeeScope);
    if (cached) setSummary(cached);
    try {
      const result = await getCommissionPayoutsSummary(payeeScope);
      if (seq === summarySeq.current) setSummary(result);
    } catch {
      /* keep prior badge counts */
    }
  }, [payeeScope]);

  const loadOrgs = useCallback(async () => {
    try {
      const orgs = await (portal ? portal.getOrgs() : getPlatformOrgs());
      setOrgIcons(orgIconMap(orgs));
    } catch {
      /* icons are optional */
    }
  }, [portal]);

  useEffect(() => {
    void loadList(listParams);
  }, [loadList, listParams]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  const refreshPayouts = useCallback(async () => {
    invalidateServerJson("/commission-payouts");
    await Promise.all([loadList(listParams), loadSummary()]);
  }, [loadList, loadSummary, listParams]);

  const onBulkConfirm = useCallback(
    async ({ note, txRef }: { note: string; txRef: string }) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      setBulkBusy(true);
      setBulkError(null);
      try {
        const result = await markCommissionPayoutsPaidBatch(ids, { note, txRef });
        setBulkOpen(false);
        clearSelection();
        if (result.paid.length > 0) {
          setOkMessage(
            result.paid.length === 1
              ? "Marked 1 invoice paid — awaiting agent confirm."
              : `Marked ${result.paid.length} invoices paid — awaiting agent confirm.`,
          );
        }
        if (result.failed.length > 0) {
          setError(
            `${result.failed.length} not marked paid: ${result.failed[0].message}` +
              (result.failed.length > 1 ? ` (and ${result.failed.length - 1} more)` : "") +
              ".",
          );
        }
        await refreshPayouts();
      } catch (err) {
        setBulkError(
          err instanceof ApiError || err instanceof Error
            ? err.message
            : "Failed to mark invoices paid",
        );
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedIds, clearSelection, refreshPayouts],
  );

  /** Refresh button. */
  const load = useCallback(async () => {
    setError(null);
    await Promise.all([refreshPayouts(), loadOrgs()]);
  }, [refreshPayouts, loadOrgs]);

  const loading = pageData == null;
  const rows = pageData?.items ?? [];
  const issuedOnPage = rows.filter((r) => r.payoutStatus === "issued").map((r) => r.id);
  const total = pageData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const statusCounts: Record<StatusFilter, number> = summary?.counts ?? {
    all: 0,
    issued: 0,
    paid: 0,
    settled: 0,
  };
  const stuckPaidCount = showOpenInvoices ? (summary?.stuckPaid ?? 0) : 0;
  const viewEmpty = !loading && total === 0 && !debouncedQuery;
  const noMatches = !loading && total === 0 && Boolean(debouncedQuery);

  useEffect(() => {
    if (pageData && page > pageCount) setPage(pageCount);
  }, [pageData, page, pageCount, setPage]);

  const onInvoiceSort = useCallback((key: InvoiceSortKey) => {
    setInvoiceSort((prev) =>
      toggleSortState(
        prev,
        key,
        key === "period" ||
          key === "fee" ||
          key === "rate" ||
          key === "commission" ||
          key === "paidAt"
          ? "desc"
          : "asc",
      ),
    );
  }, []);

  const onHistorySort = useCallback((key: HistorySortKey) => {
    setHistorySort((prev) =>
      toggleSortState(
        prev,
        key,
        key === "paidAt" || key === "amount" || key === "period" ? "desc" : "asc",
      ),
    );
  }, []);

  function openInvoice(record: CommissionPayoutRecord) {
    navigate(route(`commissions/${record.id}`));
  }

  async function onGenerateInvoices() {
    if (!canPay) return;
    const periodKey = generatePeriod.trim() || defaultCommissionPeriodKey();
    if (!PERIOD_KEY_RE.test(periodKey)) {
      setError("Period must be YYYY-MM.");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMessage(null);
    try {
      const result = await generateCommissionInvoices(periodKey);
      await refreshPayouts();
      void loadLastAutoRun();
      const zeroSkip = result.skipped.filter(
        (s) => s.reason === "skipped_zero",
      ).length;
      const otherSkip = result.skipped.length - zeroSkip;
      const label = formatCommissionPeriodLabel(periodKey);
      if (result.created.length === 0) {
        setOkMessage(
          `No invoices created for ${label} — skipped ${result.skipped.length}` +
            (zeroSkip ? ` (${zeroSkip} zero-amount)` : "") +
            (otherSkip ? ` (${otherSkip} already paid/settled)` : "") +
            ".",
        );
      } else {
        setOkMessage(
          `Created ${result.created.length} for ${label}` +
            (result.skipped.length
              ? ` · skipped ${result.skipped.length}` +
                (zeroSkip ? ` (${zeroSkip} zero)` : "")
              : "") +
            ".",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate invoices",
      );
    } finally {
      setBusy(false);
    }
  }

  if (deepLinkId) {
    return (
      <Navigate
        to={route(`commissions/${deepLinkId}`)}
        replace
      />
    );
  }

  return (
    <div className="plat-bills plat-commissions">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />
      <AuthToast message={okMessage} tone="ok" onDismiss={dismissToast} />
      {canBulkPay ? (
        <BulkMarkPaidModal
          open={bulkOpen}
          count={selectedIds.size}
          busy={bulkBusy}
          error={bulkError}
          onClose={() => setBulkOpen(false)}
          onConfirm={(opts) => void onBulkConfirm(opts)}
        />
      ) : null}

      <div className="plat-bills__period-bar">
        <div className="plat-bills__intro">
          <span className="plat-bills__intro-icon" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              width="36"
              height="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M9 13h6" />
              <path d="M9 17h4" />
            </svg>
          </span>
          <div className="plat-bills__intro-copy">
            <h1 className="plat-bills__intro-title">Commissions</h1>
            <p className="plat-bills__intro-sub">
              {portal
                ? "Monthly commission invoices from the platform."
                : "Platform → agent monthly invoices and remittance."}
            </p>
          </div>
        </div>
        <div className="plat-bills__period-tools">
          <button
            type="button"
            className="pg-dash__period-refresh"
            onClick={() => void load()}
            disabled={fetching}
            aria-label="Refresh commissions"
            title="Refresh"
          >
            {loading ? "…" : "↻"}
          </button>
          {canPay ? (
            <div
              className="plat-commissions__generate"
              aria-label="Commission invoice actions"
            >
              <CommissionPeriodPicker
                value={generatePeriod}
                onChange={setGeneratePeriod}
              />
              <button
                type="button"
                className="btn-primary plat-bills__action-btn plat-commissions__generate-btn"
                disabled={busy}
                onClick={() => void onGenerateInvoices()}
              >
                {busy ? "Generating…" : "Generate invoices"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {isViewer ? (
        <p className="banner banner-warn" style={{ marginBottom: 12 }}>
          {portal
            ? "Viewer — confirm receipt is hidden."
            : "Viewer — generate invoices is hidden."}
        </p>
      ) : null}

      {topbarSlot
        ? createPortal(
            <label className="topbar-search" htmlFor={searchInputId}>
              <svg
                className="topbar-search__icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                id={searchInputId}
                className="topbar-search__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agent, period, address, or ref…"
                aria-label="Search commissions"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {!loading && showOpenInvoices && stuckPaidCount > 0 ? (
        <p
          className="banner banner-warn plat-commissions__aging-banner"
          role="status"
          style={{ marginBottom: 12 }}
        >
          {portal
            ? stuckPaidCount === 1
              ? "1 paid invoice has awaited your confirmation for 7+ days."
              : `${stuckPaidCount} paid invoices have awaited your confirmation for 7+ days.`
            : stuckPaidCount === 1
              ? "1 paid invoice has awaited agent confirm for 7+ days."
              : `${stuckPaidCount} paid invoices have awaited agent confirm for 7+ days.`}{" "}
          {statusFilter !== "paid" ? (
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "inherit",
                textDecoration: "underline",
                cursor: "pointer",
                font: "inherit",
              }}
              onClick={() => selectStatus("paid")}
            >
              Open Awaiting
            </button>
          ) : (
            <span>Stuck rows are sorted to the top.</span>
          )}
        </p>
      ) : null}

      <div className="plat-bills__panel">
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
              onSelect={selectStatus}
            />
          </nav>
        </aside>

        <div className="plat-bills__main">
          <div className="plat-bills__table-wrap">
            <div className="plat-bills__table-scroll">
            {showOpenInvoices ? (
              <>
                {loading ? <PagePending /> : null}

                {viewEmpty && statusFilter === "all" ? (
                  <div className="plat-commissions__empty" role="status">
                    <p className="plat-commissions__empty-title">
                      No invoices yet
                    </p>
                    <p className="plat-commissions__empty-copy">
                      New invoices appear automatically on the agent pay day.
                    </p>
                  </div>
                ) : null}

                {noMatches || (viewEmpty && statusFilter !== "all") ? (
                  <div className="plat-commissions__empty" role="status">
                    <p className="plat-commissions__empty-title">
                      {debouncedQuery
                        ? "No matches"
                        : statusFilter === "issued"
                          ? "No issued invoices"
                          : statusFilter === "paid"
                            ? "Nothing awaiting"
                            : "No invoices"}
                    </p>
                    <p className="plat-commissions__empty-copy">
                      {debouncedQuery
                        ? `Nothing matched “${query.trim()}”.`
                        : statusFilter === "issued"
                          ? "Nothing waiting to remit."
                          : statusFilter === "paid"
                            ? "No paid invoices awaiting agent confirmation."
                            : "Try another filter."}
                    </p>
                  </div>
                ) : null}

                {canBulkPay && selectedIds.size > 0 ? (
                  <div className="plat-commissions__bulk-bar" role="status">
                    <span>
                      {selectedIds.size} selected
                      {selectedIds.size >= BATCH_MARK_PAID_MAX
                        ? ` (max ${BATCH_MARK_PAID_MAX} per batch)`
                        : ""}
                    </span>
                    <button type="button" className="btn-secondary" onClick={clearSelection}>
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setBulkError(null);
                        setBulkOpen(true);
                      }}
                    >
                      Confirm &amp; pay {selectedIds.size}
                    </button>
                  </div>
                ) : null}

                {!loading && rows.length > 0 ? (
                    <table className="plat-bills__table plat-commissions__table">
                      <colgroup>
                        {canBulkPay ? <col className="plat-commissions__col-select" /> : null}
                        <col className="plat-commissions__col-agent" />
                        <col className="plat-commissions__col-period" />
                        <col className="plat-commissions__col-num" />
                        <col className="plat-commissions__col-rate" />
                        <col className="plat-commissions__col-num" />
                        <col className="plat-commissions__col-status" />
                        <col className="plat-commissions__col-tx" />
                        <col className="plat-commissions__col-actions" />
                      </colgroup>
                      <thead>
                        <tr>
                          {canBulkPay ? (
                            <th className="plat-commissions__th-select">
                              <input
                                type="checkbox"
                                aria-label="Select issued invoices on this page"
                                disabled={issuedOnPage.length === 0}
                                checked={
                                  issuedOnPage.length > 0 &&
                                  issuedOnPage.every((id) => selectedIds.has(id))
                                }
                                onChange={(e) => toggleSelected(issuedOnPage, e.target.checked)}
                              />
                            </th>
                          ) : null}
                          <th>
                            <SortHeader
                              label="Agent"
                              sortKey="agent"
                              sort={invoiceSort}
                              onSort={onInvoiceSort}
                            />
                          </th>
                          <th className="plat-commissions__th-center">
                            <SortHeader
                              label="Period"
                              sortKey="period"
                              sort={invoiceSort}
                              onSort={onInvoiceSort}
                              align="center"
                            />
                          </th>
                          <th className="plat-commissions__th-num">
                            <SortHeader
                              label="Fee base"
                              sortKey="fee"
                              sort={invoiceSort}
                              onSort={onInvoiceSort}
                              align="center"
                            />
                          </th>
                          <th className="plat-commissions__th-num">
                            <SortHeader
                              label="Rate"
                              sortKey="rate"
                              sort={invoiceSort}
                              onSort={onInvoiceSort}
                              align="center"
                            />
                          </th>
                          <th className="plat-commissions__th-num">
                            <SortHeader
                              label="Commission"
                              sortKey="commission"
                              sort={invoiceSort}
                              onSort={onInvoiceSort}
                              align="center"
                            />
                          </th>
                          <th className="plat-commissions__th-center">
                            <SortHeader
                              label="Status"
                              sortKey="status"
                              sort={invoiceSort}
                              onSort={onInvoiceSort}
                              align="center"
                            />
                          </th>
                          <th>
                            <SortHeader
                              label="Tx hash"
                              sortKey="tx"
                              sort={invoiceSort}
                              onSort={onInvoiceSort}
                            />
                          </th>
                          <th className="plat-bills__th-actions">
                            <span className="sr-only">Open</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const txHash = displayServiceBillTxHash(row.txRef);
                          const aging =
                            row.payoutStatus === "paid"
                              ? formatCommissionPaidAgingHint(row.paidAt)
                              : null;
                          const href = route(`commissions/${row.id}`);
                          return (
                            <tr
                              key={row.id}
                              className="plat-bills__row plat-commissions__row--review"
                              onClick={(e) => {
                                if (
                                  (e.target as HTMLElement).closest(
                                    "a, button, input, .chain-value",
                                  )
                                ) {
                                  return;
                                }
                                openInvoice(row);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openInvoice(row);
                                }
                              }}
                              tabIndex={0}
                              aria-label={`Open ${formatCommissionPeriodLabel(row.periodKey)} invoice for ${row.payeeName}`}
                            >
                              {canBulkPay ? (
                                <td
                                  className="plat-commissions__td-select"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {row.payoutStatus === "issued" ? (
                                    <input
                                      type="checkbox"
                                      aria-label={`Select ${row.payeeName} ${formatCommissionPeriodLabel(row.periodKey)}`}
                                      checked={selectedIds.has(row.id)}
                                      disabled={
                                        !selectedIds.has(row.id) &&
                                        selectedIds.size >= BATCH_MARK_PAID_MAX
                                      }
                                      onChange={(e) => toggleSelected([row.id], e.target.checked)}
                                    />
                                  ) : null}
                                </td>
                              ) : null}
                              <td
                                className="plat-bills__merchant"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="plat-bills__merchant-cell">
                                  <AgentOrgAvatar
                                    name={row.payeeName}
                                    iconKey={orgIcons.get(row.payeeOrgId)}
                                  />
                                  <span className="plat-bills__merchant-meta">
                                    <Link
                                      className="plat-bills__merchant-name"
                                      to={
                                        portal
                                          ? route(`accounts/${row.payeeOrgId}`)
                                          : platformRoute(
                                              `accounts/agents/${row.payeeOrgId}`,
                                            )
                                      }
                                    >
                                      {row.payeeName}
                                    </Link>
                                    <Link
                                      className="plat-bills__id"
                                      to={href}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {displayCommissionInvoiceId(row.id)}
                                    </Link>
                                  </span>
                                </span>
                              </td>
                              <td className="plat-commissions__period">
                                {formatCommissionPeriodLabel(row.periodKey)}
                              </td>
                              <td className="plat-commissions__num">
                                <FundAmount amount={row.platformFeeCollected} />
                              </td>
                              <td className="plat-commissions__rate-cell">
                                {row.commissionPercent}%
                              </td>
                              <td className="plat-commissions__num plat-commissions__num--emph">
                                <FundAmount amount={row.commissionAmount} />
                              </td>
                              <td className="plat-bills__status-cell">
                                <span className="plat-bills__status-row">
                                  <span
                                    className={`plat-bills__badge tone-${commissionBadgeTone(row.payoutStatus)}${
                                      aging ? " is-pulse" : ""
                                    }`}
                                  >
                                    {commissionStatusLabel(row.payoutStatus)}
                                  </span>
                                  {portal?.canConfirmReceipt &&
                                  row.payoutStatus === "paid" ? (
                                    <button
                                      type="button"
                                      className="plat-bills__kind-chip is-action"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openInvoice(row);
                                      }}
                                    >
                                      Confirm receipt
                                    </button>
                                  ) : null}
                                </span>
                                {aging ? (
                                  <span
                                    className="muted plat-commissions__aging"
                                    style={{
                                      display: "block",
                                      fontSize: "0.75rem",
                                      marginTop: 2,
                                    }}
                                  >
                                    {aging}
                                  </span>
                                ) : null}
                              </td>
                              <td
                                className="plat-commissions__tx"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CopyableChainValue
                                  value={txHash || null}
                                  network={remittanceNetwork(row)}
                                  kind="tx"
                                  display={
                                    txHash
                                      ? truncateAddress(txHash, 8, 6)
                                      : undefined
                                  }
                                />
                              </td>
                              <td className="plat-bills__td-actions">
                                <Link
                                  className="plat-bills__row-more"
                                  to={href}
                                  aria-label={`Open invoice ${formatCommissionPeriodLabel(row.periodKey)}`}
                                  title="Open invoice"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <RowMoreIcon />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                ) : null}
              </>
            ) : (
              <>
                {loading ? <PagePending /> : null}
                {viewEmpty ? (
                  <div className="plat-commissions__empty" role="status">
                    <p className="plat-commissions__empty-title">
                      No settled payouts
                    </p>
                    <p className="plat-commissions__empty-copy">
                      Appear here after the agent confirms receipt.
                    </p>
                  </div>
                ) : null}
                {noMatches ? (
                  <div className="plat-commissions__empty" role="status">
                    <p className="plat-commissions__empty-title">No matches</p>
                    <p className="plat-commissions__empty-copy">
                      Nothing matched “{query.trim()}”.
                    </p>
                  </div>
                ) : null}
                {!loading && rows.length > 0 ? (
                    <table className="plat-bills__table plat-commissions__table plat-commissions__table--history">
                      <colgroup>
                        <col className="plat-commissions__col-agent" />
                        <col className="plat-commissions__col-num" />
                        <col className="plat-commissions__col-period" />
                        <col className="plat-commissions__col-settled" />
                        <col className="plat-commissions__col-addr" />
                        <col className="plat-commissions__col-tx" />
                        <col className="plat-commissions__col-status" />
                        <col className="plat-commissions__col-actions" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>
                            <SortHeader
                              label="Agent"
                              sortKey="agent"
                              sort={historySort}
                              onSort={onHistorySort}
                            />
                          </th>
                          <th className="plat-commissions__th-num">
                            <SortHeader
                              label="Amount"
                              sortKey="amount"
                              sort={historySort}
                              onSort={onHistorySort}
                              align="center"
                            />
                          </th>
                          <th className="plat-commissions__th-center">
                            <SortHeader
                              label="Period"
                              sortKey="period"
                              sort={historySort}
                              onSort={onHistorySort}
                              align="center"
                            />
                          </th>
                          <th className="plat-commissions__th-center">
                            <SortHeader
                              label="Settled at"
                              sortKey="paidAt"
                              sort={historySort}
                              onSort={onHistorySort}
                              align="center"
                            />
                          </th>
                          <th className="plat-commissions__th-center">
                            <SortHeader
                              label="Address"
                              sortKey="address"
                              sort={historySort}
                              onSort={onHistorySort}
                              align="center"
                            />
                          </th>
                          <th>
                            <SortHeader
                              label="Tx / ref"
                              sortKey="tx"
                              sort={historySort}
                              onSort={onHistorySort}
                            />
                          </th>
                          <th className="plat-commissions__th-center">
                            <SortHeader
                              label="Status"
                              sortKey="status"
                              sort={historySort}
                              onSort={onHistorySort}
                              align="center"
                            />
                          </th>
                          <th className="plat-bills__th-actions">
                            <span className="sr-only">Open</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((h) => {
                          const href = route(`commissions/${h.id}`);
                          return (
                            <tr
                              key={h.id}
                              className="plat-bills__row plat-commissions__row--review"
                              onClick={(e) => {
                                if (
                                  (e.target as HTMLElement).closest(
                                    "a, button, input, .chain-value",
                                  )
                                ) {
                                  return;
                                }
                                openInvoice(h);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openInvoice(h);
                                }
                              }}
                              tabIndex={0}
                              aria-label={`Review ${formatCommissionPeriodLabel(h.periodKey)} invoice for ${h.payeeName}`}
                            >
                              <td
                                className="plat-bills__merchant"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="plat-bills__merchant-cell">
                                  <AgentOrgAvatar
                                    name={h.payeeName}
                                    iconKey={orgIcons.get(h.payeeOrgId)}
                                  />
                                  <span className="plat-bills__merchant-meta">
                                    <Link
                                      className="plat-bills__merchant-name"
                                      to={
                                        portal
                                          ? route(`accounts/${h.payeeOrgId}`)
                                          : platformRoute(
                                              `accounts/agents/${h.payeeOrgId}`,
                                            )
                                      }
                                    >
                                      {h.payeeName}
                                    </Link>
                                    <Link
                                      className="plat-bills__id"
                                      to={href}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {displayCommissionInvoiceId(h.id)}
                                    </Link>
                                  </span>
                                </span>
                              </td>
                              <td className="plat-commissions__num plat-commissions__num--emph">
                                <FundAmount amount={h.commissionAmount} />
                              </td>
                              <td className="plat-commissions__period">
                                {formatCommissionPeriodLabel(h.periodKey)}
                              </td>
                              <td className="plat-commissions__paid-at">
                                {h.settledAt || h.paidAt
                                  ? formatViewerDateTime(
                                      h.settledAt ?? h.paidAt!,
                                    )
                                  : "—"}
                              </td>
                              <td
                                className="plat-commissions__addr"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CopyableChainValue
                                  value={h.payoutAddress}
                                  network={remittanceNetwork(h)}
                                  kind="address"
                                />
                              </td>
                              <td
                                className="plat-commissions__tx"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CopyableChainValue
                                  value={
                                    displayServiceBillTxHash(h.txRef) || null
                                  }
                                  network={remittanceNetwork(h)}
                                  kind="tx"
                                  display={
                                    h.txRef
                                      ? truncateAddress(
                                          displayServiceBillTxHash(h.txRef),
                                          8,
                                          6,
                                        )
                                      : undefined
                                  }
                                />
                              </td>
                              <td className="plat-bills__status-cell">
                                <span
                                  className={`plat-bills__badge tone-${commissionBadgeTone(h.payoutStatus)}`}
                                >
                                  {commissionStatusLabel(h.payoutStatus)}
                                </span>
                              </td>
                              <td className="plat-bills__td-actions">
                                <Link
                                  className="plat-bills__row-more"
                                  to={href}
                                  aria-label={`Open invoice ${formatCommissionPeriodLabel(h.periodKey)}`}
                                  title="Open invoice"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <RowMoreIcon />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                ) : null}
              </>
            )}
            </div>
            {!loading && total > 0 ? (
              <OrgListPagination
                page={page}
                pageCount={pageCount}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="plat-bills__foot">
        <p className="muted plat-bills__schedule-note" role="note">
          {billingCalendar ? (
            <>
              Auto-create at <strong>{utcMidnightLabel()}</strong> on day{" "}
              <strong>{billingCalendar.agentPayDayStart}</strong>.{" "}
            </>
          ) : null}
          {portal ? (
            "Invoices are created monthly by the platform. Confirm receipt once the remittance lands."
          ) : (
            <span className="plat-bills__auto-run" role="status">
              {formatLastAutoRunBanner(lastAutoRun)}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
