import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { formatViewerDateTime, utcMidnightLabel } from "../shared/dateTime";
import { formatCommissionPeriodLabel } from "../commercial/commissionStatements";
import { truncateAddress } from "./orgDetailSeeds";
import { displayServiceBillTxHash } from "../shared/serviceBillPeriod";
import {
  listCommissionPayouts,
  generateCommissionInvoices,
  defaultCommissionPeriodKey,
  findPayout,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import {
  formatCommissionPaidAgingHint,
  commissionPaidIsAging,
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
import { FundAmount } from "./FundAmount";
import { OrgListPagination } from "./OrgListPagination";
import { sessionCanIssueServiceBill, sessionIsPlatformViewerOnly } from "./org";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { isCustomOrgIcon, orgIconGlyph } from "../shared/orgBrand";
import { PagePending } from "./ui/PlatformPending";
import {
  SortHeader,
  compareDate,
  compareNumber,
  compareText,
  toggleSortState,
  type SortState,
} from "./ui/TableArrange";

type StatusFilter = "all" | "issued" | "paid" | "settled";

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

const STATUS_NAV: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "issued", label: "Issued" },
  { id: "paid", label: "Awaiting" },
  { id: "settled", label: "Settled" },
];

const PAGE_SIZE = 14;
/** Server page size for accumulating list rows (API max 500). */
const FETCH_PAGE = 200;
const PERIOD_KEY_RE = /^\d{4}-\d{2}$/;

function listStatusForView(status: StatusFilter): string | string[] {
  if (status === "settled") return "settled";
  if (status === "issued") return "issued";
  if (status === "paid") return "paid";
  return ["issued", "paid"];
}

function mergePayoutRows(
  prev: CommissionPayoutRecord[],
  next: CommissionPayoutRecord[],
): CommissionPayoutRecord[] {
  const map = new Map(prev.map((r) => [r.id, r]));
  for (const r of next) map.set(r.id, r);
  return [...map.values()];
}

async function countStuckPaidAcrossPages(): Promise<number> {
  let offset = 0;
  let total = Infinity;
  let aging = 0;
  const seen = new Set<string>();
  while (offset < total) {
    const page = await listCommissionPayouts({
      payer: "platform",
      status: "paid",
      limit: FETCH_PAGE,
      offset,
    });
    total = page.total;
    for (const r of page.items) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (commissionPaidIsAging(r.paidAt)) aging += 1;
    }
    if (page.items.length === 0) break;
    offset += page.items.length;
  }
  return aging;
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

function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function AgentOrgAvatar({
  name,
  iconKey,
}: {
  name: string;
  iconKey?: string | null;
}) {
  const hasBrand =
    isCustomOrgIcon(iconKey) || Boolean(orgIconGlyph(iconKey));
  if (hasBrand) {
    return (
      <OrgBrandMark
        name={name}
        iconKey={iconKey}
        size={36}
        className="plat-bills__merchant-avatar plat-bills__merchant-avatar--brand"
      />
    );
  }
  return (
    <span className="plat-bills__merchant-avatar" aria-hidden>
      {agentInitials(name)}
    </span>
  );
}

function StatusTabIcon({ id }: { id: StatusFilter }) {
  const common = {
    className: "plat-bills__status-icon",
    viewBox: "0 0 24 24",
    width: 15,
    height: 15,
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
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
    <svg {...common}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
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
  const canPay = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const isViewer = useMemo(
    () => sessionIsPlatformViewerOnly(session),
    [session],
  );

  const [platformPayouts, setPlatformPayouts] = useState<
    CommissionPayoutRecord[]
  >([]);
  const [loading, setLoading] = useState(() => peekPlatformOrgs() == null);
  const [hasLoaded, setHasLoaded] = useState(() => peekPlatformOrgs() != null);
  const hasLoadedRef = useRef(hasLoaded);
  hasLoadedRef.current = hasLoaded;
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
  const [stuckPaidCount, setStuckPaidCount] = useState(0);
  const [listTotal, setListTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<
    Record<StatusFilter, number>
  >({
    all: 0,
    issued: 0,
    paid: 0,
    settled: 0,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [orgIcons, setOrgIcons] = useState<Map<string, string | null>>(() => {
    const cached = peekPlatformOrgs();
    return cached ? orgIconMap(cached) : new Map();
  });
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
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
    try {
      const items = await listAuditLog({
        action: "commission_payout_auto",
        limit: 1,
      });
      setLastAutoRun(items[0] ?? null);
    } catch {
      /* optional ops banner */
    }
  }, []);

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
  }, [loadLastAutoRun]);

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

  const refreshStuckPaidCount = useCallback(async () => {
    try {
      setStuckPaidCount(await countStuckPaidAcrossPages());
    } catch {
      /* optional ops cue */
    }
  }, []);

  /** Totals for every status pill — independent of the active tab filter. */
  const refreshStatusCounts = useCallback(async () => {
    try {
      const [issued, paid, settled] = await Promise.all([
        listCommissionPayouts({
          payer: "platform",
          status: "issued",
          limit: 1,
          offset: 0,
        }),
        listCommissionPayouts({
          payer: "platform",
          status: "paid",
          limit: 1,
          offset: 0,
        }),
        listCommissionPayouts({
          payer: "platform",
          status: "settled",
          limit: 1,
          offset: 0,
        }),
      ]);
      setStatusCounts({
        issued: issued.total,
        paid: paid.total,
        settled: settled.total,
        all: issued.total + paid.total,
      });
    } catch {
      /* keep prior badge counts */
    }
  }, []);

  const showOpenInvoices = statusFilter !== "settled";

  const refreshPayouts = useCallback(async () => {
    const page = await listCommissionPayouts({
      payer: "platform",
      status: listStatusForView(statusFilter),
      limit: FETCH_PAGE,
      offset: 0,
    });
    setPlatformPayouts(page.items);
    setListTotal(page.total);
    await refreshStatusCounts();
    if (showOpenInvoices) await refreshStuckPaidCount();
    else setStuckPaidCount(0);
  }, [
    statusFilter,
    showOpenInvoices,
    refreshStuckPaidCount,
    refreshStatusCounts,
  ]);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const orgs = await getPlatformOrgs();
      setOrgIcons(orgIconMap(orgs));
      const page = await listCommissionPayouts({
        payer: "platform",
        status: listStatusForView(statusFilter),
        limit: FETCH_PAGE,
        offset: 0,
      });
      setPlatformPayouts(page.items);
      setListTotal(page.total);
      await refreshStatusCounts();
      if (statusFilter !== "settled") await refreshStuckPaidCount();
      else setStuckPaidCount(0);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : err instanceof Error
            ? err.message
            : "Failed to load commission invoices",
      );
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [statusFilter, refreshStuckPaidCount, refreshStatusCounts]);

  const loadMorePayouts = useCallback(async () => {
    if (loadingMore || platformPayouts.length >= listTotal) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listCommissionPayouts({
        payer: "platform",
        status: listStatusForView(statusFilter),
        limit: FETCH_PAGE,
        offset: platformPayouts.length,
      });
      setPlatformPayouts((prev) => mergePayoutRows(prev, page.items));
      setListTotal(page.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more invoices",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [
    loadingMore,
    platformPayouts.length,
    listTotal,
    statusFilter,
  ]);

  const hasMoreServer = platformPayouts.length < listTotal;

  useEffect(() => {
    void load();
  }, [load]);

  const invoices = useMemo(
    () =>
      platformPayouts.filter(
        (p) => p.payoutStatus === "issued" || p.payoutStatus === "paid",
      ),
    [platformPayouts],
  );

  const history = useMemo(
    () => platformPayouts.filter((p) => p.payoutStatus === "settled"),
    [platformPayouts],
  );

  const queryNorm = query.trim().toLowerCase();

  const filteredInvoices = useMemo(() => {
    const matched = !queryNorm
      ? [...invoices]
      : invoices.filter((r) => {
          const hay = [
            r.payeeName,
            r.payeeOrgId,
            r.periodLabel,
            r.periodKey,
            r.payoutStatus,
            r.payoutAddress,
            r.txRef,
            displayServiceBillTxHash(r.txRef),
            displayCommissionInvoiceId(r.id),
            r.id,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(queryNorm);
        });
    const dir = invoiceSort.dir === "asc" ? 1 : -1;
    return matched.sort((a, b) => {
      const agingA =
        a.payoutStatus === "paid" && commissionPaidIsAging(a.paidAt) ? 1 : 0;
      const agingB =
        b.payoutStatus === "paid" && commissionPaidIsAging(b.paidAt) ? 1 : 0;
      if (agingA !== agingB) return agingB - agingA;

      let cmp = 0;
      switch (invoiceSort.key) {
        case "agent":
          cmp = compareText(a.payeeName, b.payeeName);
          break;
        case "fee":
          cmp = compareNumber(a.platformFeeCollected, b.platformFeeCollected);
          break;
        case "rate":
          cmp = compareNumber(
            Number(a.commissionPercent),
            Number(b.commissionPercent),
          );
          break;
        case "commission":
          cmp = compareNumber(
            Number(a.commissionAmount),
            Number(b.commissionAmount),
          );
          break;
        case "status":
          cmp = compareText(a.payoutStatus, b.payoutStatus);
          break;
        case "tx":
          cmp = compareText(a.txRef ?? "", b.txRef ?? "");
          break;
        case "paidAt":
          cmp = compareDate(a.paidAt ?? "", b.paidAt ?? "");
          break;
        case "period":
        default:
          cmp = compareText(a.periodKey, b.periodKey);
          break;
      }
      if (cmp !== 0) return dir * cmp;
      return dir * compareText(a.payeeName, b.payeeName);
    });
  }, [invoices, queryNorm, invoiceSort]);

  useEffect(() => {
    setInvoicesPage(1);
  }, [statusFilter, queryNorm]);

  const filteredHistory = useMemo(() => {
    const list = !queryNorm
      ? [...history]
      : history.filter((h) => {
          const hay = [
            h.payeeName,
            h.payeeOrgId,
            h.periodLabel,
            h.periodKey,
            h.payoutStatus,
            h.payoutAddress,
            h.txRef,
            displayServiceBillTxHash(h.txRef),
            displayCommissionInvoiceId(h.id),
            h.id,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(queryNorm);
        });
    const dir = historySort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      let cmp = 0;
      switch (historySort.key) {
        case "period":
          cmp = compareText(a.periodKey, b.periodKey);
          break;
        case "agent":
          cmp = compareText(a.payeeName, b.payeeName);
          break;
        case "amount":
          cmp = compareNumber(
            Number(a.commissionAmount),
            Number(b.commissionAmount),
          );
          break;
        case "address":
          cmp = compareText(a.payoutAddress ?? "", b.payoutAddress ?? "");
          break;
        case "tx":
          cmp = compareText(a.txRef ?? "", b.txRef ?? "");
          break;
        case "status":
          cmp = compareText(a.payoutStatus, b.payoutStatus);
          break;
        case "paidAt":
        default:
          cmp = compareDate(a.settledAt ?? a.paidAt ?? "", b.settledAt ?? b.paidAt ?? "");
          break;
      }
      if (cmp !== 0) return dir * cmp;
      return dir * compareDate(a.settledAt ?? a.paidAt ?? "", b.settledAt ?? b.paidAt ?? "");
    });
  }, [history, queryNorm, historySort]);

  const invoicesPageCount = Math.max(
    1,
    Math.ceil(filteredInvoices.length / PAGE_SIZE),
  );
  const pagedInvoices = useMemo(() => {
    const start = (invoicesPage - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, invoicesPage]);

  const historyPageCount = Math.max(
    1,
    Math.ceil(filteredHistory.length / PAGE_SIZE),
  );
  const pagedHistory = useMemo(() => {
    const start = (historyPage - 1) * PAGE_SIZE;
    return filteredHistory.slice(start, start + PAGE_SIZE);
  }, [filteredHistory, historyPage]);

  useEffect(() => {
    setInvoicesPage(1);
    setHistoryPage(1);
  }, [queryNorm, invoiceSort, historySort]);

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

  useEffect(() => {
    if (invoicesPage > invoicesPageCount) setInvoicesPage(invoicesPageCount);
  }, [invoicesPage, invoicesPageCount]);

  useEffect(() => {
    if (historyPage > historyPageCount) setHistoryPage(historyPageCount);
  }, [historyPage, historyPageCount]);

  function openInvoice(record: CommissionPayoutRecord) {
    navigate(platformRoute(`commissions/${record.id}`));
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
        to={platformRoute(`commissions/${deepLinkId}`)}
        replace
      />
    );
  }

  return (
    <div className="plat-bills plat-commissions">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />
      <AuthToast message={okMessage} tone="ok" onDismiss={dismissToast} />

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
              Platform → agent monthly invoices and remittance.
            </p>
          </div>
        </div>
        <div className="plat-bills__period-tools">
          <button
            type="button"
            className="pg-dash__period-refresh"
            onClick={() => void load()}
            disabled={loading}
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
          Viewer — generate invoices is hidden.
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
          {stuckPaidCount === 1
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
            role="tablist"
            aria-label="Status filter"
          >
            {STATUS_NAV.map((item) => {
              const count = statusCounts[item.id];
              const active = statusFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  className={`plat-bills__status-item${
                    active ? " is-active" : ""
                  }`}
                  aria-selected={active}
                  onClick={() => selectStatus(item.id)}
                >
                  <span className="plat-bills__status-badge" aria-hidden>
                    <StatusTabIcon id={item.id} />
                  </span>
                  <span className="plat-bills__status-item-label">
                    {item.label}
                  </span>
                  <span className="plat-bills__status-item-count">{count}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="plat-bills__main">
          <div className="plat-bills__table-wrap">
            <div className="plat-bills__table-scroll">
            {showOpenInvoices ? (
              <>
                {loading && !hasLoaded ? <PagePending /> : null}

                {!loading && invoices.length === 0 ? (
                  <div className="plat-commissions__empty" role="status">
                    <p className="plat-commissions__empty-title">
                      No invoices yet
                    </p>
                    <p className="plat-commissions__empty-copy">
                      New invoices appear automatically on the agent pay day.
                    </p>
                  </div>
                ) : null}

                {!loading &&
                invoices.length > 0 &&
                filteredInvoices.length === 0 ? (
                  <div className="plat-commissions__empty" role="status">
                    <p className="plat-commissions__empty-title">
                      {queryNorm
                        ? "No matches"
                        : statusFilter === "issued"
                          ? "No issued invoices"
                          : statusFilter === "paid"
                            ? "Nothing awaiting"
                            : "No invoices"}
                    </p>
                    <p className="plat-commissions__empty-copy">
                      {queryNorm
                        ? `Nothing matched “${query.trim()}”.`
                        : statusFilter === "issued"
                          ? "Nothing waiting to remit."
                          : statusFilter === "paid"
                            ? "No paid invoices awaiting agent confirmation."
                            : "Try another filter."}
                    </p>
                  </div>
                ) : null}

                {!loading && filteredInvoices.length > 0 ? (
                    <table className="plat-bills__table plat-commissions__table">
                      <colgroup>
                        <col className="plat-commissions__col-agent" />
                        <col className="plat-commissions__col-num" />
                        <col className="plat-commissions__col-rate" />
                        <col className="plat-commissions__col-num" />
                        <col className="plat-commissions__col-period" />
                        <col className="plat-commissions__col-status" />
                        <col className="plat-commissions__col-tx" />
                        <col className="plat-commissions__col-actions" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>
                            <SortHeader
                              label="Agent"
                              sortKey="agent"
                              sort={invoiceSort}
                              onSort={onInvoiceSort}
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
                              label="Period"
                              sortKey="period"
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
                        {pagedInvoices.map((row) => {
                          const txHash = displayServiceBillTxHash(row.txRef);
                          const aging =
                            row.payoutStatus === "paid"
                              ? formatCommissionPaidAgingHint(row.paidAt)
                              : null;
                          const href = platformRoute(`commissions/${row.id}`);
                          return (
                            <tr
                              key={row.id}
                              className="plat-bills__row plat-commissions__row--review"
                              onClick={(e) => {
                                if (
                                  (e.target as HTMLElement).closest(
                                    "a, button, .chain-value",
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
                                      to={platformRoute(
                                        `accounts/agents/${row.payeeOrgId}`,
                                      )}
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
                              <td className="plat-commissions__num">
                                <FundAmount amount={row.platformFeeCollected} />
                              </td>
                              <td className="plat-commissions__rate-cell">
                                {row.commissionPercent}%
                              </td>
                              <td className="plat-commissions__num plat-commissions__num--emph">
                                <FundAmount amount={row.commissionAmount} />
                              </td>
                              <td className="plat-commissions__period">
                                {formatCommissionPeriodLabel(row.periodKey)}
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
                {!loading && history.length === 0 ? (
                  <div className="plat-commissions__empty" role="status">
                    <p className="plat-commissions__empty-title">
                      No settled payouts
                    </p>
                    <p className="plat-commissions__empty-copy">
                      Appear here after the agent confirms receipt.
                    </p>
                  </div>
                ) : null}
                {!loading &&
                history.length > 0 &&
                filteredHistory.length === 0 ? (
                  <div className="plat-commissions__empty" role="status">
                    <p className="plat-commissions__empty-title">No matches</p>
                    <p className="plat-commissions__empty-copy">
                      Nothing matched “{query.trim()}”.
                    </p>
                  </div>
                ) : null}
                {!loading && filteredHistory.length > 0 ? (
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
                        {pagedHistory.map((h) => {
                          const href = platformRoute(`commissions/${h.id}`);
                          return (
                            <tr
                              key={h.id}
                              className="plat-bills__row plat-commissions__row--review"
                              onClick={(e) => {
                                if (
                                  (e.target as HTMLElement).closest(
                                    "a, button, .chain-value",
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
                                      to={platformRoute(
                                        `accounts/agents/${h.payeeOrgId}`,
                                      )}
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
            {!loading && showOpenInvoices && filteredInvoices.length > 0 ? (
              <OrgListPagination
                page={invoicesPage}
                pageCount={invoicesPageCount}
                total={filteredInvoices.length}
                pageSize={PAGE_SIZE}
                onPageChange={setInvoicesPage}
              />
            ) : null}
            {!loading && !showOpenInvoices && filteredHistory.length > 0 ? (
              <OrgListPagination
                page={historyPage}
                pageCount={historyPageCount}
                total={filteredHistory.length}
                pageSize={PAGE_SIZE}
                onPageChange={setHistoryPage}
              />
            ) : null}
            {hasMoreServer &&
            !loading &&
            ((showOpenInvoices && filteredInvoices.length > 0) ||
              (!showOpenInvoices && filteredHistory.length > 0)) ? (
              <div className="plat-bills__load-more">
                <p className="muted">
                  Loaded {platformPayouts.length} of {listTotal}
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loadingMore}
                  onClick={() => void loadMorePayouts()}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
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
          <span className="plat-bills__auto-run" role="status">
            {formatLastAutoRunBanner(lastAutoRun)}
          </span>
        </p>
      </div>
    </div>
  );
}
