import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatCommissionPeriodLabel } from "../../commercial/commissionStatements";
import {
  generateCommissionInvoices,
  defaultCommissionPeriodKey,
  findPayout,
  markCommissionPayoutsPaidBatch,
  type CommissionPayoutRecord,
} from "../../commercial/commissionPayoutRecords";
import {
  ApiError,
  getBillingCalendarSettings,
  listAuditLog,
  type AuditLogEntry,
  type BillingCalendarSettings,
  type Session,
} from "../api";
import { getPlatformOrgs, peekPlatformOrgs } from "../platformOrgList";
import { platformRoute } from "../../shared/portalRouting";
import { useCommissionsPortal } from "../commissionsPortal";
import { sessionCanIssueServiceBill, sessionIsPlatformViewerOnly } from "../org";
import {
  getCommissionPayoutsSummary,
  listCommissionPayoutsServer,
  peekCommissionPayoutsServer,
  peekCommissionPayoutsSummary,
  type CommissionPayoutsListParams,
  type CommissionPayoutsSummary,
} from "../../shared/commissionsServer";
import { invalidateServerJson, type ServerPage } from "../../shared/serverListApi";
import { useDebouncedValue } from "../../shared/useDebouncedValue";
import { toggleSortState, type SortState } from "../ui/TableArrange";
import {
  BATCH_MARK_PAID_MAX,
  HISTORY_SORT_SERVER,
  PAGE_SIZE,
  PERIOD_KEY_RE,
  listStatusForView,
  orgIconMap,
  parseStatusFilter,
  type HistorySortKey,
  type InvoiceSortKey,
  type StatusFilter,
} from "./commissionsShared";

/** Filters, server paging, selection, bulk remittance and invoice generation for the commissions list. */
export function useCommissionsData(session: Session) {
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

  const statusParam = searchParams.get("status");
  useEffect(() => {
    if (statusParam) setStatusFilter(parseStatusFilter(statusParam, null));
  }, [statusParam]);

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

  return {
    searchInputId,
    statusFilter,
    portal,
    route,
    canPay,
    error,
    okMessage,
    topbarSlot,
    generatePeriod,
    setGeneratePeriod,
    busy,
    billingCalendar,
    lastAutoRun,
    orgIcons,
    invoiceSort,
    historySort,
    query,
    setQuery,
    dismissToast,
    deepLinkId,
    selectStatus,
    showOpenInvoices,
    debouncedQuery,
    page,
    setPage,
    canBulkPay,
    selectedIds,
    bulkOpen,
    setBulkOpen,
    bulkBusy,
    bulkError,
    setBulkError,
    toggleSelected,
    clearSelection,
    fetching,
    onBulkConfirm,
    load,
    loading,
    rows,
    issuedOnPage,
    total,
    pageCount,
    statusCounts,
    viewEmpty,
    noMatches,
    onInvoiceSort,
    onHistorySort,
    openInvoice,
    onGenerateInvoices,
  };
}

export type CommissionsData = ReturnType<typeof useCommissionsData>;
