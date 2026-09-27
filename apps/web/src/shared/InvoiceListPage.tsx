import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";
import {
  ApiError,
  createInvoiceExport,
  getInvoiceExport,
  invoiceExportDownloadUrl,
  listOrdersPage,
  listOrgUsers,
  ordersCsvUrl,
  type InvoiceExportJob,
  type OrgAccount,
  type PaymentOrder,
  type PaymentOrderListSummary,
  type Session,
} from "../merchant/api";
import {
  displayNetworkForPair,
  enabledRegistry,
  NETWORK_SHORT_LABEL,
} from "./assetNetworks";
import { OrgBrandMark } from "./OrgBrandMark";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { FundAmount } from "../platform/FundAmount";
import { OrgListPagination } from "../platform/OrgListPagination";
import { PagePending } from "../platform/ui/PlatformPending";
import { getPlatformOrgs, peekPlatformOrgs } from "../platform/platformOrgList";
import { getMerchantOrgs, peekMerchantOrgs } from "../merchant/merchantOrgList";
import { orderStatusLabel, orderStatusTone } from "../merchant/orderStatus";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "../ui/SearchableSelect";
import {
  sessionCanExportOrders,
  sessionIsCashierOnly,
  primaryMerchantOrgId,
} from "../merchant/org";
import { getMerchantOrder } from "../merchant/merchantOrderDetail";
import { getMerchantOrderPayment } from "../merchant/merchantOrderPaymentDetails";
import { merchantRoute, platformRoute } from "./portalRouting";
import { TopbarSearch } from "./TopbarSearch";
import {
  INVOICE_PAGE_SIZE,
  INVOICE_PERIOD_OPTIONS,
  INVOICE_STATUS_CHIPS,
  formatInvoiceCreatedDate,
  formatInvoiceCreatedTime,
  invoiceDefaultsForSession,
  periodToDateInputs,
  periodToRange,
  platformUnscopedHistoryGate,
  platformUnscopedPeriodDisabled,
  type InvoiceListVariant,
  type InvoicePeriodId,
  type InvoiceStatusFilter,
} from "./invoiceListModel";

type Props = {
  session: Session;
  variant: InvoiceListVariant;
};

function merchantIdForOrg(
  org: OrgAccount | undefined,
  byId: Map<string, OrgAccount>,
): string | null {
  if (!org) return null;
  if (org.type === "merchant") return org.id;
  if (org.type === "merchant_site" && org.parentId) {
    const parent = byId.get(org.parentId);
    if (parent?.type === "merchant") return parent.id;
    return org.parentId;
  }
  return null;
}

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

const INVOICE_ASSET_CARD_ASSETS = ["ETH", "TRX", "USDC", "USDT"] as const;

function InvoiceStatusChipIcon({ id }: { id: InvoiceStatusFilter }) {
  const props = {
    className: "invoice-list__chip-icon",
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (id === "payment_anomaly") {
    return (
      <svg {...props}>
        <path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  if (id === "open") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (id === "completed") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </svg>
    );
  }
  if (id === "closed") {
    return (
      <svg {...props}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 12h6" />
      </svg>
    );
  }
  // All
  return (
    <svg {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function InvoiceListPage({ session, variant }: Props) {
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
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );
  const loadGen = useRef(0);

  useLayoutEffect(() => {
    const centerId =
      variant === "platform" ? "platform-topbar-center" : "merchant-topbar-center";
    const actionsId =
      variant === "platform"
        ? "platform-topbar-actions"
        : "merchant-topbar-actions";
    setTopbarSlot(document.getElementById(centerId));
    setTopbarActionsSlot(document.getElementById(actionsId));
  }, [variant]);

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

  const range = useMemo(
    () => periodToRange(period, customFrom, customTo, utcDays),
    [period, customFrom, customTo, utcDays],
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

  const assetSelectOptions = useMemo((): SearchableSelectOption[] => {
    const assets = [
      ...new Set(enabledRegistry().map((r) => r.asset)),
    ].sort();
    return [
      { id: "", label: "All assets" },
      ...assets.map((a) => ({
        id: a,
        label: a,
        icon: <AssetIcon asset={a} />,
      })),
    ];
  }, []);

  const networkSelectOptions = useMemo((): SearchableSelectOption[] => {
    const rows = enabledRegistry().filter((r) =>
      assetFilter ? r.asset === assetFilter : true,
    );
    const networks = [...new Set(rows.map((r) => r.network))].sort();
    return [
      { id: "", label: "All networks" },
      ...networks.map((n) => ({
        id: n,
        label: NETWORK_SHORT_LABEL[n] ?? n,
        icon: <NetworkIcon network={n} />,
      })),
    ];
  }, [assetFilter]);

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

  const formatPayable = useCallback((raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return n.toLocaleString(undefined, {
      maximumFractionDigits: n >= 1000 ? 2 : 6,
    });
  }, []);

  const assetCardRows = useMemo(() => {
    const byAsset = new Map(
      summary.byAsset.map((row) => [row.asset, row.payableAmount] as const),
    );
    return INVOICE_ASSET_CARD_ASSETS.map((asset) => ({
      asset,
      payableAmount: byAsset.get(asset) ?? "0",
    }));
  }, [summary.byAsset]);

  const resetFilters = useCallback(() => {
    setAgentFilter("");
    setUtcDays(false);
    setMerchantFilter("");
    setSiteFilter("");
    setCashierFilter("");
    setAssetFilter("");
    setNetworkFilter("");
    setPeriod(defaults.period);
    const dates = periodToDateInputs(defaults.period);
    setCustomFrom(dates.from);
    setCustomTo(dates.to);
  }, [defaults.period]);

  const partyColumnLabel =
    variant === "cashier" ? "Site" : "Merchant & Cashier";

  const showEmpty = !loading && (gateMessage || orders.length === 0);

  return (
    <div className={`invoice-list invoice-list--${variant}${refreshing ? " is-refreshing" : ""}`}>
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />
      <AuthToast message={okToast} tone="ok" onDismiss={dismissToast} />

      {topbarSlot
        ? createPortal(
            <TopbarSearch
              placeholder="Search Invoice #, id, or reference"
              aria-label="Search invoices"
              value={query}
              onChange={setQuery}
              onEnter={(q) => setDebouncedQ(q)}
            />,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div className="invoice-list__topbar-actions">
              {canCreate ? (
                <Link
                  className="invoice-list__btn invoice-list__btn--primary"
                  to={merchantRoute("orders/new")}
                >
                  Create invoice
                </Link>
              ) : null}
              {canExport && !needsScopeGate && total > 0 && exportHref ? (
                <a className="invoice-list__btn" href={exportHref}>
                  Export CSV
                </a>
              ) : null}
              {canExport && !needsScopeGate && total > 5000 ? (
                exportJob?.status === "ready" ? (
                  <a
                    className="invoice-list__btn"
                    href={invoiceExportDownloadUrl(exportJob.id)}
                  >
                    Download CSV
                  </a>
                ) : (
                  <button
                    type="button"
                    className="invoice-list__btn"
                    onClick={() => void requestAsyncExport()}
                    disabled={
                      exportBusy ||
                      exportJob?.status === "queued" ||
                      exportJob?.status === "running"
                    }
                  >
                    {exportJob?.status === "queued" ||
                    exportJob?.status === "running" ||
                    exportBusy
                      ? "Preparing…"
                      : "Request export"}
                  </button>
                )
              ) : null}
              <button
                type="button"
                className="invoice-list__btn"
                onClick={() => void load()}
                disabled={loading || refreshing}
              >
                Refresh
              </button>
            </div>,
            topbarActionsSlot,
          )
        : null}

      {refreshing ? (
        <div className="invoice-list__progress" aria-hidden />
      ) : null}

      <header className="invoice-list__header">
        <div>
          <h1 className="invoice-list__title">Invoices</h1>
          <span className="invoice-list__count">
            {summary.count.toLocaleString()} invoices
          </span>
        </div>
        <div className="invoice-list__total">
          <span className="invoice-list__total-label">
            Total invoice value
          </span>
          <span className="invoice-list__total-value">
            <FundAmount amount={summary.invoiceAmountUsd ?? "0"} />
          </span>
        </div>
      </header>

      <div className="invoice-list__asset-cards" role="status">
        {assetCardRows.map((row) => (
          <div className="invoice-list__asset-card" key={row.asset}>
            <AssetIcon asset={row.asset} />
            <span className="invoice-list__asset-card-code">{row.asset}</span>
            <span className="invoice-list__asset-card-amt">
              {formatPayable(row.payableAmount)}
            </span>
          </div>
        ))}
      </div>

      {exportJob?.status === "failed" && exportJob.error ? (
        <p className="invoice-list__export-error" role="alert">
          Export failed: {exportJob.error}
        </p>
      ) : null}

      <div className="invoice-list__workspace">
        <aside className="invoice-list__filters-panel">
          <div className="invoice-list__filters-head">
            <span>Filters</span>
            <button
              type="button"
              className="invoice-list__filters-reset"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
          <label className="invoice-list__field">
            <span>Period</span>
            <SearchableSelect
              value={period}
              options={periodSelectOptions}
              allowEmpty={false}
              ariaLabel="Period"
              menuMinWidth={200}
              menuClassName="invoice-list__select-menu"
              onChange={(id) => applyPeriod(id as InvoicePeriodId)}
            />
          </label>
          <label className="invoice-list__field">
            <span>From{utcDays ? " (UTC)" : ""}</span>
            <span className="invoice-list__date-wrap">
              <input
                className="invoice-list__select invoice-list__date"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => onFromChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                aria-label="From date"
              />
              <span className="invoice-list__date-icon" aria-hidden>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <rect
                    x="2"
                    y="3.5"
                    width="12"
                    height="10.5"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.25"
                  />
                  <path
                    d="M5 2v2.5M11 2v2.5M2 7h12"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </span>
          </label>
          <label className="invoice-list__field">
            <span>To{utcDays ? " (UTC)" : ""}</span>
            <span className="invoice-list__date-wrap">
              <input
                className="invoice-list__select invoice-list__date"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => onToChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                aria-label="To date"
              />
              <span className="invoice-list__date-icon" aria-hidden>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <rect
                    x="2"
                    y="3.5"
                    width="12"
                    height="10.5"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.25"
                  />
                  <path
                    d="M5 2v2.5M11 2v2.5M2 7h12"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </span>
          </label>
          <hr className="invoice-list__filters-rule" />
          {variant === "platform" ? (
            <label className="invoice-list__field">
              <span>Agent</span>
              <SearchableSelect
                value={agentFilter}
                options={[
                  { id: "", label: "All agents" },
                  ...agents.map((a) => ({ id: a.id, label: a.name })),
                ]}
                allowEmpty={false}
                ariaLabel="Agent"
                menuMinWidth={220}
                menuClassName="invoice-list__select-menu"
                onChange={(id) => {
                  setAgentFilter(id);
                  if (id) {
                    setMerchantFilter("");
                    setSiteFilter("");
                    setCashierFilter("");
                  }
                }}
              />
            </label>
          ) : null}
          {variant === "platform" ? (
            <label className="invoice-list__field">
              <span>Merchant</span>
              <SearchableSelect
                value={merchantFilter}
                options={[
                  { id: "", label: "All merchants" },
                  ...merchants.map((m) => ({ id: m.id, label: m.name })),
                ]}
                allowEmpty={false}
                ariaLabel="Merchant"
                menuMinWidth={220}
                menuClassName="invoice-list__select-menu"
                onChange={(id) => {
                  setMerchantFilter(id);
                  if (id) setAgentFilter("");
                  setSiteFilter("");
                  setCashierFilter("");
                }}
              />
            </label>
          ) : null}
          {variant !== "cashier" ? (
            <label className="invoice-list__field">
              <span>Site</span>
              <SearchableSelect
                value={siteFilter}
                options={[
                  { id: "", label: "All sites" },
                  ...sitesForSelect.map((s) => ({ id: s.id, label: s.name })),
                ]}
                allowEmpty={false}
                ariaLabel="Site"
                menuMinWidth={220}
                menuClassName="invoice-list__select-menu"
                onChange={(id) => {
                  setSiteFilter(id);
                  setCashierFilter("");
                }}
              />
            </label>
          ) : null}
          {!cashierOnly ? (
            <label className="invoice-list__field">
              <span>Cashier</span>
              <SearchableSelect
                value={cashierFilter}
                options={[
                  {
                    id: "",
                    label:
                      variant === "platform" && !cashierOrgId
                        ? "None"
                        : "All cashiers",
                  },
                  ...cashiers.map((c) => ({ id: c.id, label: c.name })),
                ]}
                allowEmpty={false}
                ariaLabel="Cashier"
                disabled={!cashierOrgId && variant === "platform"}
                menuMinWidth={200}
                menuClassName="invoice-list__select-menu"
                onChange={(id) => setCashierFilter(id)}
              />
            </label>
          ) : null}
          {!cashierOnly ? (
            <hr className="invoice-list__filters-rule" />
          ) : null}
          <label className="invoice-list__field">
            <span>Asset</span>
            <SearchableSelect
              value={assetFilter}
              options={assetSelectOptions}
              allowEmpty={false}
              ariaLabel="Asset"
              menuMinWidth={200}
              menuClassName="invoice-list__select-menu"
              onChange={(id) => {
                setAssetFilter(id);
                setNetworkFilter("");
              }}
            />
          </label>
          <label className="invoice-list__field">
            <span>Network</span>
            <SearchableSelect
              value={networkFilter}
              options={networkSelectOptions}
              allowEmpty={false}
              ariaLabel="Network"
              menuMinWidth={220}
              menuClassName="invoice-list__select-menu"
              onChange={(id) => setNetworkFilter(id)}
            />
          </label>
        </aside>

        <div className="invoice-list__main">
          <div
            className="invoice-list__status"
            role="tablist"
            aria-label="Invoice status"
          >
            {INVOICE_STATUS_CHIPS.map((chip) => (
              <button
                key={chip.id || "all"}
                type="button"
                role="tab"
                className={`invoice-list__chip${
                  statusFilter === chip.id ? " is-active" : ""
                }`}
                onClick={() => setStatusFilter(chip.id)}
                aria-selected={statusFilter === chip.id}
              >
                <InvoiceStatusChipIcon id={chip.id} />
                <span className="invoice-list__chip-label">{chip.label}</span>
              </button>
            ))}
            {!gateMessage && !loading ? (
              <span
                className="invoice-list__status-count"
                aria-live="polite"
                title={`${total.toLocaleString()} invoices`}
              >
                <span className="invoice-list__status-count-num">
                  {total.toLocaleString()}
                </span>
                <span className="invoice-list__status-count-label">
                  {total === 1 ? "invoice" : "invoices"}
                </span>
              </span>
            ) : null}
          </div>

          {canExport && total > 5000 ? (
            <p className="invoice-list__summary-hint">
              Narrow filters or Request export for CSV
            </p>
          ) : null}

          <div className="invoice-list__table-wrap">
            {loading && !hasLoaded ? <PagePending /> : null}

            {showEmpty ? (
          <div className="invoice-list__empty" role="status">
            <p className="invoice-list__empty-title">
              {gateMessage ? "Select a scope" : "No invoices"}
            </p>
            <p className="invoice-list__empty-copy">
              {gateMessage ??
                (statusFilter === "payment_anomaly"
                  ? "Nothing needs Attention. Try Open or clear filters."
                  : "No invoices match these filters. Change period or filters.")}
            </p>
            </div>
            ) : null}

            {!loading && !gateMessage && orders.length > 0 ? (
              <table className="invoice-list__table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th className="invoice-list__th-merchant">{partyColumnLabel}</th>
                <th className="invoice-list__th-amount">Amount (USD)</th>
                <th>Asset &amp; Network</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const rowOrg = order.orgId
                  ? orgById.get(order.orgId)
                  : undefined;
                const isSite = rowOrg?.type === "merchant_site";
                const mid = merchantIdForOrg(rowOrg, orgById);
                const merchantOrg = mid ? orgById.get(mid) : undefined;
                const displayName =
                  merchantOrg?.name ??
                  rowOrg?.name ??
                  order.orgName ??
                  (order.orgId ? order.orgId.slice(0, 8) : "—");
                const siteName = isSite ? rowOrg?.name ?? null : null;
                const refLabel = order.merchantReference?.trim() || "—";
                const cashierLabel =
                  order.createdByName?.trim() ||
                  (order.createdBy
                    ? userNameById.get(order.createdBy)
                    : undefined) ||
                  order.createdByEmail?.trim() ||
                  (order.createdBy ? order.createdBy.slice(0, 8) : "—");
                const partyIconKey =
                  rowOrg?.iconKey ?? merchantOrg?.iconKey ?? null;
                const cashierAvatar =
                  order.createdByAvatarUrl?.trim() ||
                  (order.createdBy
                    ? userAvatarById.get(order.createdBy)
                    : undefined) ||
                  null;

                return (
                  <tr
                    key={order.id}
                    className={
                      order.status === "payment_anomaly"
                        ? "invoice-list__row--anomaly"
                        : undefined
                    }
                  >
                    <td className="invoice-list__invoice-cell">
                      <Link
                        className="invoice-list__order"
                        to={orderHref(order.id)}
                        onMouseEnter={() => {
                          void getMerchantOrder(order.id);
                          void getMerchantOrderPayment(order.id);
                        }}
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="invoice-list__invoice-ref">
                        Reference {refLabel}
                      </span>
                    </td>
                    <td className="invoice-list__merchant">
                      <div className="invoice-list__party">
                        <OrgBrandMark
                          name={displayName}
                          iconKey={partyIconKey}
                          size={40}
                          className="invoice-list__party-mark"
                        />
                        <div className="invoice-list__party-body">
                          <div className="invoice-list__party-merchant">
                            <span className="invoice-list__party-name">
                              {displayName}
                            </span>
                            {siteName ? (
                              <span className="invoice-list__site">
                                {" "}
                                · {siteName}
                              </span>
                            ) : null}
                            {variant === "platform" && mid
                              ? (() => {
                                  const paused =
                                    merchantOrg?.status === "paused" ||
                                    rowOrg?.status === "paused";
                                  const createBlocked =
                                    merchantOrg?.orderCreateSuspended ===
                                      true ||
                                    rowOrg?.orderCreateSuspended === true;
                                  const merchantHref = platformRoute(
                                    `accounts/merchants/${encodeURIComponent(mid)}`,
                                  );
                                  if (!paused && !createBlocked) return null;
                                  return (
                                    <span className="invoice-list__compliance">
                                      {paused ? (
                                        <Link
                                          className="invoice-list__compliance-badge is-paused"
                                          to={merchantHref}
                                          title="Merchant suspended — open merchant"
                                        >
                                          Suspended
                                        </Link>
                                      ) : null}
                                      {createBlocked ? (
                                        <Link
                                          className="invoice-list__compliance-badge is-suspended"
                                          to={merchantHref}
                                          title="Order create blocked — open merchant"
                                        >
                                          Create blocked
                                        </Link>
                                      ) : null}
                                    </span>
                                  );
                                })()
                              : null}
                          </div>
                          {variant !== "cashier" ? (
                            <div className="invoice-list__party-cashier">
                              <span
                                className="invoice-list__user-avatar"
                                aria-hidden
                              >
                                {cashierAvatar ? (
                                  <img src={cashierAvatar} alt="" />
                                ) : (
                                  <DefaultUserAvatar className="invoice-list__user-avatar-default" />
                                )}
                              </span>
                              <span className="invoice-list__cashier-name">
                                {cashierLabel}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="invoice-list__amount-usd">
                      <FundAmount
                        amount={
                          order.invoiceAmountUsd ?? order.payableAmount.amount
                        }
                      />
                    </td>
                    <td className="invoice-list__asset-net">
                      <span className="invoice-list__asset-net-asset">
                        {order.asset}
                      </span>
                      <span className="invoice-list__asset-net-network">
                        {displayNetworkForPair(order.asset, order.network)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-badge invoice-list__status-badge tone-${orderStatusTone(order.status, order)}`}
                      >
                        {orderStatusLabel(order.status, order)}
                      </span>
                    </td>
                    <td className="invoice-list__created">
                      <span className="invoice-list__created-date">
                        {formatInvoiceCreatedDate(order.createdAt)}
                      </span>
                      <span className="invoice-list__created-time">
                        {formatInvoiceCreatedTime(order.createdAt)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            ) : null}
          </div>

          {!loading && !gateMessage && total > 0 ? (
            <OrgListPagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={INVOICE_PAGE_SIZE}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
