import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useViewerTimeZone } from "../useViewerTimeZone";
import { useSearchParams } from "react-router-dom";
import {
  ApiError,
  createInvoiceExport,
  getInvoiceExport,
  listOrdersPage,
  listOrgUsers,
  ordersCsvUrl,
  type InvoiceExportJob,
  type OrgAccount,
  type PaymentOrder,
  type PaymentOrderListSummary,
  type Session,
} from "../../merchant/api";
import { getPlatformOrgs, peekPlatformOrgs } from "../../platform/platformOrgList";
import { getMerchantOrgs, peekMerchantOrgs } from "../../merchant/merchantOrgList";
import type { SearchableSelectOption } from "../../ui/SearchableSelect";
import {
  sessionCanExportOrders,
  sessionIsCashierOnly,
  primaryMerchantOrgId,
} from "../../merchant/org";
import { merchantRoute, platformRoute } from "../portalRouting";
import { serverNow } from "../serverClock";
import { parseOrderChannelFilter, type OrderChannelFilter } from "../orderChannel";
import {
  INVOICE_PAGE_SIZE,
  INVOICE_PERIOD_OPTIONS,
  invoiceDefaultsForSession,
  periodToDateInputs,
  periodToRange,
  platformUnscopedHistoryGate,
  platformUnscopedPeriodDisabled,
  type InvoiceListVariant,
  type InvoicePeriodId,
  type InvoiceStatusFilter,
} from "../invoiceListModel";

function readStatus(raw: string | null, fallback: InvoiceStatusFilter): InvoiceStatusFilter {
  if (raw === "payment_anomaly" || raw === "open" || raw === "completed" || raw === "closed") {
    return raw;
  }
  if (raw === "all" || raw === "") return raw === "all" ? "" : fallback;
  if (raw == null) return fallback;
  return fallback;
}

function readPeriod(raw: string | null, fallback: InvoicePeriodId): InvoicePeriodId {
  const ids = INVOICE_PERIOD_OPTIONS.map((o) => o.id);
  if (raw && (ids as string[]).includes(raw)) return raw as InvoicePeriodId;
  return fallback;
}

function personDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const name = [firstName, lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return name || null;
}

/** Filters (URL-synced), org/cashier lookups, paged invoice loading, export jobs and expiry ticking. */
export function useInvoiceListData(session: Session, variant: InvoiceListVariant) {
  const defaults = useMemo(
    () => invoiceDefaultsForSession(variant, session),
    [variant, session],
  );
  const cashierOnly = variant === "cashier" || sessionIsCashierOnly(session);
  const canExport =
    !cashierOnly &&
    (variant === "platform" || sessionCanExportOrders(session));
  const canCreate =
    variant === "cashier" ||
    (variant === "merchant" &&
      session.memberships.some((m) =>
        ["owner", "administrator", "cashier"].includes(m.role),
      ));

  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>(() =>
    readStatus(searchParams.get("status"), defaults.status),
  );
  const [period, setPeriod] = useState<InvoicePeriodId>(() =>
    readPeriod(searchParams.get("period"), defaults.period),
  );
  const [customFrom, setCustomFrom] = useState(() => {
    const initial = readPeriod(searchParams.get("period"), defaults.period);
    if (initial === "custom") return searchParams.get("from") ?? "";
    return periodToDateInputs(initial).from;
  });
  const [customTo, setCustomTo] = useState(() => {
    const initial = readPeriod(searchParams.get("period"), defaults.period);
    if (initial === "custom") return searchParams.get("to") ?? "";
    return periodToDateInputs(initial).to;
  });
  const [merchantFilter, setMerchantFilter] = useState(
    () => searchParams.get("merchant") ?? "",
  );
  const [agentFilter, setAgentFilter] = useState(() =>
    variant === "platform" ? (searchParams.get("agent") ?? "") : "",
  );
  /** Custom From/To are UTC calendar days (Review links from UTC month-to-date KPIs). */
  const [utcDays, setUtcDays] = useState(
    () => searchParams.get("period") === "custom" && searchParams.get("utc") === "1",
  );
  const [siteFilter, setSiteFilter] = useState(
    () => searchParams.get("site") ?? "",
  );
  const [cashierFilter, setCashierFilter] = useState(
    () => searchParams.get("cashier") ?? "",
  );
  const [assetFilter, setAssetFilter] = useState(
    () => searchParams.get("asset") ?? "",
  );
  const [networkFilter, setNetworkFilter] = useState(
    () => searchParams.get("network") ?? "",
  );
  const [channelFilter, setChannelFilter] = useState<OrderChannelFilter>(
    () => parseOrderChannelFilter(searchParams.get("via")),
  );
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(query);
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page") || "1");
    return Number.isFinite(p) && p >= 1 ? p : 1;
  });
  const [exportJob, setExportJob] = useState<InvoiceExportJob | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  const [orgs, setOrgs] = useState<OrgAccount[]>(() => {
    if (variant === "platform") return peekPlatformOrgs() ?? [];
    return peekMerchantOrgs() ?? [];
  });
  const [cashiers, setCashiers] = useState<
    { id: string; email: string; name: string; avatarUrl?: string | null }[]
  >([]);
  const [userAvatarById, setUserAvatarById] = useState<
    Map<string, string | null>
  >(() => new Map());
  const [userNameById, setUserNameById] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<PaymentOrderListSummary>({
    count: 0,
    invoiceAmountUsd: null,
    byAsset: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okToast, setOkToast] = useState<string | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const loadGen = useRef(0);

  useLayoutEffect(() => {
    // The cashier terminal has no page top bar; search sits in the Invoices header there.
    const inline = document.getElementById("invoice-list-header-search");
    setTopbarSlot(
      inline?.closest(".cashier-shell")
        ? inline
        : document.getElementById("platform-topbar-center"),
    );
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  // Sync filters → URL
  useEffect(() => {
    const next = new URLSearchParams();
    if (statusFilter) next.set("status", statusFilter);
    else next.set("status", "all");
    next.set("period", period);
    if (period === "custom") {
      if (customFrom) next.set("from", customFrom);
      if (customTo) next.set("to", customTo);
      if (utcDays) next.set("utc", "1");
    }
    if (agentFilter) next.set("agent", agentFilter);
    if (merchantFilter) next.set("merchant", merchantFilter);
    if (siteFilter) next.set("site", siteFilter);
    if (cashierFilter) next.set("cashier", cashierFilter);
    if (assetFilter) next.set("asset", assetFilter);
    if (networkFilter) next.set("network", networkFilter);
    if (channelFilter) next.set("via", channelFilter);
    if (debouncedQ) next.set("q", debouncedQ);
    if (page > 1) next.set("page", String(page));
    setSearchParams(next, { replace: true });
  }, [
    statusFilter,
    period,
    customFrom,
    customTo,
    utcDays,
    agentFilter,
    merchantFilter,
    siteFilter,
    cashierFilter,
    assetFilter,
    networkFilter,
    channelFilter,
    debouncedQ,
    page,
    setSearchParams,
  ]);

  const orgById = useMemo(() => {
    const map = new Map<string, OrgAccount>();
    for (const o of orgs) map.set(o.id, o);
    return map;
  }, [orgs]);

  const agents = useMemo(
    () =>
      orgs
        .filter((o) => o.type === "agent")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const merchants = useMemo(
    () =>
      orgs
        .filter((o) => o.type === "merchant")
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const sitesForSelect = useMemo(() => {
    const sites = orgs.filter((o) => o.type === "merchant_site");
    const scoped = merchantFilter
      ? sites.filter((s) => s.parentId === merchantFilter)
      : variant === "platform"
        ? sites
        : sites;
    return scoped.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs, merchantFilter, variant]);

  useEffect(() => {
    if (siteFilter && !sitesForSelect.some((s) => s.id === siteFilter)) {
      setSiteFilter("");
    }
  }, [siteFilter, sitesForSelect]);

  const cashierOrgId =
    siteFilter ||
    merchantFilter ||
    (variant === "merchant" || variant === "cashier"
      ? primaryMerchantOrgId(session)
      : null);
  useEffect(() => {
    if (cashierOnly || !cashierOrgId) {
      setCashiers([]);
      return;
    }
    let cancelled = false;
    void listOrgUsers(cashierOrgId)
      .then((members) => {
        if (cancelled) return;
        setCashiers(
          members
            .filter(
              (m) =>
                m.role === "cashier" ||
                m.role === "owner" ||
                m.role === "administrator",
            )
            .map((m) => {
              const email = m.email || m.userId.slice(0, 8);
              const name =
                personDisplayName(m.firstName, m.lastName) || email;
              return {
                id: m.userId,
                email,
                name,
                avatarUrl: m.avatarUrl ?? null,
              };
            }),
        );
        setUserAvatarById((prev) => {
          const next = new Map(prev);
          for (const m of members) {
            next.set(m.userId, m.avatarUrl ?? null);
          }
          return next;
        });
        setUserNameById((prev) => {
          const next = new Map(prev);
          for (const m of members) {
            const name = personDisplayName(m.firstName, m.lastName);
            if (name) next.set(m.userId, name);
          }
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setCashiers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cashierOrgId, cashierOnly]);

  const viewerTz = useViewerTimeZone();
  const range = useMemo(
    () => periodToRange(period, customFrom, customTo, utcDays),
    [period, customFrom, customTo, utcDays, viewerTz],
  );

  const needsScopeGate = useMemo(() => {
    if (variant !== "platform") return false;
    if (merchantFilter || siteFilter || agentFilter) return false;
    return (
      platformUnscopedHistoryGate({
        status: statusFilter,
        period,
        createdFrom: range.createdFrom,
        createdTo: range.createdTo,
      }) != null
    );
  }, [variant, statusFilter, merchantFilter, siteFilter, agentFilter, period, range]);

  const scopeGateMessage = useMemo(() => {
    if (variant !== "platform") return null;
    if (merchantFilter || siteFilter || agentFilter) return null;
    return platformUnscopedHistoryGate({
      status: statusFilter,
      period,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    });
  }, [variant, statusFilter, merchantFilter, siteFilter, agentFilter, period, range]);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    if (!hasLoaded) setLoading(true);
    else setRefreshing(true);
    setError(null);
    setGateMessage(null);

    try {
      const orgList =
        variant === "platform"
          ? await getPlatformOrgs()
          : await getMerchantOrgs();
      if (gen !== loadGen.current) return;
      setOrgs(orgList);

      if (needsScopeGate) {
        setOrders([]);
        setTotal(0);
        setSummary({ count: 0, invoiceAmountUsd: null, byAsset: [] });
        setGateMessage(
          scopeGateMessage ??
            "Select a merchant or site, or choose a shorter period to browse history.",
        );
        return;
      }

      const orgId = siteFilter || merchantFilter || undefined;
      const includeSubtree = Boolean(merchantFilter && !siteFilter);
      const result = await listOrdersPage({
        status: statusFilter || undefined,
        orgId,
        includeSubtree: includeSubtree || undefined,
        agentOrgId: orgId ? undefined : agentFilter || undefined,
        createdBy: cashierOnly ? undefined : cashierFilter || undefined,
        createdFrom: range.createdFrom,
        createdTo: range.createdTo,
        q: debouncedQ || undefined,
        asset: assetFilter || undefined,
        network: networkFilter || undefined,
        createdVia: channelFilter || undefined,
        limit: INVOICE_PAGE_SIZE,
        offset: (page - 1) * INVOICE_PAGE_SIZE,
      });
      if (gen !== loadGen.current) return;
      setOrders(result.items);
      setTotal(result.total);
      setSummary(result.summary);
    } catch (err) {
      if (gen !== loadGen.current) return;
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load invoices",
      );
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
        setHasLoaded(true);
      }
    }
  }, [
    variant,
    hasLoaded,
    needsScopeGate,
    scopeGateMessage,
    siteFilter,
    merchantFilter,
    agentFilter,
    statusFilter,
    cashierOnly,
    cashierFilter,
    assetFilter,
    networkFilter,
    channelFilter,
    range.createdFrom,
    range.createdTo,
    debouncedQ,
    page,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  // When platform unscoped All would be gated on current period, nudge to 7d.
  useEffect(() => {
    if (variant !== "platform") return;
    if (merchantFilter || siteFilter || agentFilter) return;
    if (statusFilter !== "") return;
    if (!platformUnscopedPeriodDisabled(statusFilter, period)) return;
    setPeriod("7d");
    const dates = periodToDateInputs("7d");
    setCustomFrom(dates.from);
    setCustomTo(dates.to);
  }, [variant, merchantFilter, siteFilter, agentFilter, statusFilter, period]);

  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    period,
    customFrom,
    customTo,
    agentFilter,
    merchantFilter,
    siteFilter,
    cashierFilter,
    assetFilter,
    networkFilter,
    channelFilter,
    debouncedQ,
  ]);

  const pageCount = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const orderHref = (id: string) =>
    variant === "platform"
      ? platformRoute(`orders/${encodeURIComponent(id)}`)
      : merchantRoute(`orders/${encodeURIComponent(id)}`);

  const dismissToast = useCallback(() => {
    setError(null);
    setOkToast(null);
  }, []);

  const listFilterPayload = useMemo(
    () => ({
      status: statusFilter || undefined,
      orgId: siteFilter || merchantFilter || undefined,
      includeSubtree: Boolean(merchantFilter && !siteFilter) || undefined,
      agentOrgId: siteFilter || merchantFilter ? undefined : agentFilter || undefined,
      createdBy: cashierFilter || undefined,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
      q: debouncedQ || undefined,
      asset: assetFilter || undefined,
      network: networkFilter || undefined,
      createdVia: channelFilter || undefined,
    }),
    [
      statusFilter,
      siteFilter,
      merchantFilter,
      agentFilter,
      cashierFilter,
      range.createdFrom,
      range.createdTo,
      debouncedQ,
      assetFilter,
      networkFilter,
      channelFilter,
    ],
  );

  useEffect(() => {
    setExportJob(null);
  }, [listFilterPayload]);

  const exportHref =
    canExport && !needsScopeGate && total > 0 && total <= 5000
      ? ordersCsvUrl({ ...listFilterPayload, limit: 5000 })
      : null;

  async function requestAsyncExport() {
    if (!canExport || needsScopeGate) return;
    setExportBusy(true);
    setError(null);
    try {
      const job = await createInvoiceExport(listFilterPayload);
      setExportJob(job);
      setOkToast("Preparing export…");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to start export",
      );
    } finally {
      setExportBusy(false);
    }
  }

  useEffect(() => {
    if (!exportJob) return;
    if (exportJob.status === "ready") {
      setOkToast("Export ready — download CSV");
      return;
    }
    if (exportJob.status === "failed") return;
    const t = window.setInterval(() => {
      void getInvoiceExport(exportJob.id)
        .then((job) => setExportJob(job))
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(t);
  }, [exportJob]);

  const periodSelectOptions = useMemo((): SearchableSelectOption[] => {
    return INVOICE_PERIOD_OPTIONS.filter((o) => {
      if (variant !== "platform" || merchantFilter || siteFilter || agentFilter) return true;
      return !platformUnscopedPeriodDisabled(statusFilter, o.id);
    }).map((o) => ({ id: o.id, label: o.label }));
  }, [variant, merchantFilter, siteFilter, agentFilter, statusFilter]);

  useEffect(() => {
    if (periodSelectOptions.some((o) => o.id === period)) return;
    const fallback = periodSelectOptions[0]?.id as InvoicePeriodId | undefined;
    if (!fallback) return;
    setPeriod(fallback);
    if (fallback !== "custom") {
      const dates = periodToDateInputs(fallback);
      setCustomFrom(dates.from);
      setCustomTo(dates.to);
    }
  }, [periodSelectOptions, period]);

  const applyPeriod = useCallback((next: InvoicePeriodId) => {
    setPeriod(next);
    if (next === "custom") return;
    setUtcDays(false);
    const dates = periodToDateInputs(next);
    setCustomFrom(dates.from);
    setCustomTo(dates.to);
  }, []);

  const onFromChange = useCallback((value: string) => {
    setPeriod("custom");
    setCustomFrom(value);
    if (value && customTo && value > customTo) setCustomTo(value);
  }, [customTo]);

  const onToChange = useCallback((value: string) => {
    setPeriod("custom");
    setCustomTo(value);
    if (value && customFrom && value < customFrom) setCustomFrom(value);
  }, [customFrom]);

  const resetFilters = useCallback(() => {
    setAgentFilter("");
    setUtcDays(false);
    setMerchantFilter("");
    setSiteFilter("");
    setCashierFilter("");
    setAssetFilter("");
    setNetworkFilter("");
    setChannelFilter("");
    setPeriod(defaults.period);
    const dates = periodToDateInputs(defaults.period);
    setCustomFrom(dates.from);
    setCustomTo(dates.to);
  }, [defaults.period]);

  const [nowMs, setNowMs] = useState(() => serverNow());
  const hasPending = orders.some((o) => o.status === "pending_payment");
  useEffect(() => {
    if (!hasPending) return;
    const tick = window.setInterval(() => setNowMs(serverNow()), 1000);
    return () => window.clearInterval(tick);
  }, [hasPending]);

  /** Reload once per invoice after its countdown ends so the badge follows the server's expiry. */
  const expiryReloaded = useRef(new Set<string>());
  useEffect(() => {
    const due = orders.filter((o) => {
      if (o.status !== "pending_payment" || expiryReloaded.current.has(o.id)) return false;
      const end = Date.parse(o.expiresAt);
      return Number.isFinite(end) && end + 3000 <= nowMs;
    });
    if (due.length === 0) return;
    for (const o of due) expiryReloaded.current.add(o.id);
    void load();
  }, [orders, nowMs, load]);

  return {
    cashierOnly,
    canExport,
    canCreate,
    statusFilter,
    setStatusFilter,
    period,
    customFrom,
    customTo,
    merchantFilter,
    setMerchantFilter,
    agentFilter,
    setAgentFilter,
    utcDays,
    siteFilter,
    setSiteFilter,
    cashierFilter,
    setCashierFilter,
    assetFilter,
    setAssetFilter,
    networkFilter,
    setNetworkFilter,
    channelFilter,
    setChannelFilter,
    query,
    setQuery,
    setDebouncedQ,
    page,
    setPage,
    pageCount,
    exportJob,
    exportBusy,
    exportHref,
    requestAsyncExport,
    cashiers,
    userAvatarById,
    userNameById,
    orgById,
    agents,
    merchants,
    sitesForSelect,
    cashierOrgId,
    orders,
    total,
    summary,
    loading,
    refreshing,
    hasLoaded,
    error,
    okToast,
    gateMessage,
    topbarSlot,
    needsScopeGate,
    load,
    orderHref,
    dismissToast,
    periodSelectOptions,
    applyPeriod,
    onFromChange,
    onToChange,
    resetFilters,
    nowMs,
  };
}
