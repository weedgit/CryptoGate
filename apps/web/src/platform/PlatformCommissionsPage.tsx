import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { formatCommissionPeriodLabel } from "../commercial/commissionStatements";
import { truncateAddress } from "./orgDetailSeeds";
import {
  listCommissionPayouts,
  generateCommissionInvoices,
  markCommissionPayoutPaid,
  defaultCommissionPeriodKey,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import {
  CommissionInvoiceModal,
  destForInvoice,
  remittanceNetwork,
} from "../commercial/CommissionInvoiceModal";
import {
  ApiError,
  listAgentPayoutAddresses,
  getPlatformOrgs,
  type OrgAccount,
  type Session,
} from "./api";
import { orgDetailHref } from "./platformOrgTree";
import { agentRoute, platformRoute } from "../shared/portalRouting";
import { FundAmount } from "./FundAmount";
import { OrgListPagination } from "./OrgListPagination";
import { sessionCanIssueServiceBill, sessionIsPlatformViewerOnly } from "./org";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { PlatformPending, PlatformTableSkeleton } from "./ui/PlatformPending";
import {
  SortHeader,
  compareDate,
  compareNumber,
  compareText,
  toggleSortState,
  type SortState,
} from "./ui/TableArrange";

type CommissionsTab = "invoices" | "history" | "sub-agent";

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

type CascadeSortKey =
  | "paidAt"
  | "period"
  | "subAgent"
  | "payer"
  | "amount"
  | "address"
  | "tx"
  | "status";

type Props = { session: Session };

const TABS: { id: CommissionsTab; label: string }[] = [
  { id: "invoices", label: "Invoices" },
  { id: "history", label: "Payout history" },
  { id: "sub-agent", label: "Sub-agent" },
];

const PAGE_SIZE = 20;
const PERIOD_KEY_RE = /^\d{4}-\d{2}$/;

function parseCommissionsTab(raw: string | null): CommissionsTab {
  if (raw === "sub-agent") return "sub-agent";
  if (raw === "history") return "history";
  return "invoices";
}

function platformPayoutTone(status: string): string {
  if (status === "issued") return "issued";
  if (status === "paid") return "paid";
  if (status === "settled") return "settled";
  return status;
}

function platformPayoutStatusLabel(status: string): string {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Paid (awaiting agent)";
  if (status === "settled") return "Settled";
  return status;
}

function cascadePayoutTone(status: string): string {
  if (status === "paid") return "paid";
  if (status === "verifying") return "verifying";
  if (status === "ready") return "ready";
  if (status === "settled") return "settled";
  return "scheduled";
}

function cascadePayoutStatusLabel(status: string): string {
  if (status === "verifying") return "Verifying";
  if (status === "ready") return "Ready";
  if (status === "paid") return "Paid";
  if (status === "settled") return "Settled";
  return status;
}

/** B12 — Platform → agent monthly commission invoices & payout history. */
export function PlatformCommissionsPage({ session }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<CommissionsTab>(() =>
    parseCommissionsTab(searchParams.get("tab")),
  );
  const canPay = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const isViewer = useMemo(
    () => sessionIsPlatformViewerOnly(session),
    [session],
  );

  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [payoutAddressByAgent, setPayoutAddressByAgent] = useState<
    Map<string, { address: string; asset: string; network: string }>
  >(() => new Map());
  const [platformPayouts, setPlatformPayouts] = useState<
    CommissionPayoutRecord[]
  >([]);
  const [cascadePayouts, setCascadePayouts] = useState<
    CommissionPayoutRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);
  const [slip, setSlip] = useState<CommissionPayoutRecord | null>(null);
  const [paidNote, setPaidNote] = useState("");
  const [generatePeriod, setGeneratePeriod] = useState(() =>
    defaultCommissionPeriodKey(),
  );
  const [busy, setBusy] = useState(false);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [cascadePage, setCascadePage] = useState(1);
  const [invoiceSort, setInvoiceSort] = useState<SortState<InvoiceSortKey>>({
    key: "period",
    dir: "desc",
  });
  const [historySort, setHistorySort] = useState<SortState<HistorySortKey>>({
    key: "paidAt",
    dir: "desc",
  });
  const [cascadeSort, setCascadeSort] = useState<SortState<CascadeSortKey>>({
    key: "paidAt",
    dir: "desc",
  });
  const [query, setQuery] = useState("");

  const dismissToast = useCallback(() => setError(null), []);

  const writeSearchParams = useCallback(
    (next: {
      tab?: CommissionsTab;
      payee?: string | null;
      period?: string | null;
    }) => {
      const params = new URLSearchParams();
      const nextTab = next.tab ?? tab;
      if (nextTab !== "invoices") params.set("tab", nextTab);
      if (next.payee) params.set("payee", next.payee);
      if (next.period) params.set("period", next.period);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams, tab],
  );

  function selectTab(next: CommissionsTab) {
    setTab(next);
    writeSearchParams({
      tab: next,
      payee:
        next === "invoices" || next === "history"
          ? searchParams.get("payee")
          : null,
      period:
        next === "invoices" || next === "history"
          ? searchParams.get("period")
          : null,
    });
    if (next === "sub-agent") {
      setSlip(null);
      setPaidNote("");
    }
  }

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  const refreshPayouts = useCallback(async () => {
    const all = await listCommissionPayouts();
    setPlatformPayouts(all.filter((p) => p.payer === "platform"));
    setCascadePayouts(all.filter((p) => p.payer === "agent"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRows, payoutAddrs, payoutRows] = await Promise.all([
        getPlatformOrgs(),
        listAgentPayoutAddresses(),
        listCommissionPayouts(),
      ]);
      setOrgs(orgRows);

      const addrMap = new Map<
        string,
        { address: string; asset: string; network: string }
      >();
      for (const payout of payoutAddrs) {
        if (!payout.address) continue;
        addrMap.set(payout.orgId, {
          address: payout.address,
          asset: payout.asset,
          network: payout.network,
        });
      }
      setPayoutAddressByAgent(addrMap);
      setPlatformPayouts(payoutRows.filter((p) => p.payer === "platform"));
      setCascadePayouts(payoutRows.filter((p) => p.payer === "agent"));
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
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

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

  const cascadeHistory = cascadePayouts;
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
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(queryNorm);
        });
    const dir = invoiceSort.dir === "asc" ? 1 : -1;
    return matched.sort((a, b) => {
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

  const filteredCascade = useMemo(() => {
    const list = !queryNorm
      ? [...cascadeHistory]
      : cascadeHistory.filter((h) => {
          const payerName = h.payerOrgId
            ? (byId.get(h.payerOrgId)?.name ?? h.payerOrgId)
            : "";
          const hay = [
            h.payeeName,
            h.payeeOrgId,
            payerName,
            h.payerOrgId,
            h.periodLabel,
            h.periodKey,
            h.payoutStatus,
            h.payoutAddress,
            h.txRef,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(queryNorm);
        });
    const dir = cascadeSort.dir === "asc" ? 1 : -1;
    const payerNameOf = (h: CommissionPayoutRecord) =>
      h.payerOrgId ? (byId.get(h.payerOrgId)?.name ?? h.payerOrgId) : "";
    return list.sort((a, b) => {
      let cmp = 0;
      switch (cascadeSort.key) {
        case "period":
          cmp = compareText(a.periodKey, b.periodKey);
          break;
        case "subAgent":
          cmp = compareText(a.payeeName, b.payeeName);
          break;
        case "payer":
          cmp = compareText(payerNameOf(a), payerNameOf(b));
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
          cmp = compareDate(a.paidAt, b.paidAt);
          break;
      }
      if (cmp !== 0) return dir * cmp;
      return dir * compareDate(a.paidAt, b.paidAt);
    });
  }, [cascadeHistory, queryNorm, byId, cascadeSort]);

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

  const cascadePageCount = Math.max(
    1,
    Math.ceil(filteredCascade.length / PAGE_SIZE),
  );
  const pagedCascade = useMemo(() => {
    const start = (cascadePage - 1) * PAGE_SIZE;
    return filteredCascade.slice(start, start + PAGE_SIZE);
  }, [filteredCascade, cascadePage]);

  useEffect(() => {
    setInvoicesPage(1);
    setHistoryPage(1);
    setCascadePage(1);
  }, [queryNorm, invoiceSort, historySort, cascadeSort]);

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

  const onCascadeSort = useCallback((key: CascadeSortKey) => {
    setCascadeSort((prev) =>
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

  useEffect(() => {
    if (cascadePage > cascadePageCount) setCascadePage(cascadePageCount);
  }, [cascadePage, cascadePageCount]);

  useEffect(() => {
    const payee = searchParams.get("payee");
    const period = searchParams.get("period");
    if (!payee || !period || platformPayouts.length === 0) return;
    const match = platformPayouts.find(
      (p) => p.payeeOrgId === payee && p.periodKey === period,
    );
    if (match) {
      const reviewTab: CommissionsTab =
        match.payoutStatus === "settled" ? "history" : "invoices";
      setTab(reviewTab);
      setPaidNote(match.note?.trim() ?? "");
      setSlip(match);
    }
  }, [searchParams, platformPayouts]);

  function openSlip(
    record: CommissionPayoutRecord,
    opts?: { tab?: CommissionsTab },
  ) {
    const reviewTab =
      opts?.tab ??
      (record.payoutStatus === "settled"
        ? "history"
        : tab === "history"
          ? "history"
          : "invoices");
    setTab(reviewTab);
    setPaidNote(record.note?.trim() ?? "");
    setSlip(record);
    writeSearchParams({
      tab: reviewTab,
      payee: record.payeeOrgId,
      period: record.periodKey,
    });
  }

  function closeSlip() {
    setSlip(null);
    setPaidNote("");
    writeSearchParams({ tab, payee: null, period: null });
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
    try {
      const result = await generateCommissionInvoices(periodKey);
      await refreshPayouts();
      if (result.created.length === 0 && result.skipped.length > 0) {
        setError(
          `No invoices created for ${formatCommissionPeriodLabel(periodKey)} — all agents skipped.`,
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

  async function onConfirmPay() {
    if (!slip || !canPay || slip.payoutStatus !== "issued") return;
    const note = paidNote.trim();
    if (!note) {
      setError("Add a note to confirm payment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await markCommissionPayoutPaid(slip.id, { note });
      await refreshPayouts();
      if (updated) {
        setSlip(updated);
        setPaidNote(updated.note?.trim() ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm payment");
    } finally {
      setBusy(false);
    }
  }

  const slipDest = slip
    ? destForInvoice(slip, payoutAddressByAgent.get(slip.payeeOrgId) ?? null)
    : null;

  return (
    <div className="plat-bills plat-commissions">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

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
                placeholder="Search agent, period, address, or ref…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search commissions"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot && canPay
        ? createPortal(
            <div
              className="org-agents__actions plat-commissions__generate"
              aria-label="Commission invoice actions"
            >
              <label className="plat-commissions__period-input">
                <span className="sr-only">Invoice billing period</span>
                <span className="plat-commissions__period-field">
                  <input
                    className="field-control plat-commissions__period-control"
                    type="month"
                    value={generatePeriod}
                    onChange={(e) => setGeneratePeriod(e.target.value)}
                    aria-label="Invoice billing period"
                  />
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
                </span>
              </label>
              <button
                type="button"
                className="btn-primary org-agents__cta"
                disabled={busy}
                onClick={() => void onGenerateInvoices()}
              >
                {busy ? "Generating…" : "Generate invoices"}
              </button>
            </div>,
            topbarActionsSlot,
          )
        : null}

      {isViewer ? (
        <p className="banner banner-warn" style={{ marginBottom: 12 }}>
          Viewer — generate invoices and confirm payment are hidden.
        </p>
      ) : null}

      <div
        className="b3-agent-detail__tabs plat-commissions__tabs"
        role="tablist"
        aria-label="Commission scope"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`b3-agent-detail__tab${tab === t.id ? " is-active" : ""}`}
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "invoices" ? (
        <>
          <div className="plat-bills__table-wrap">
            {loading ? (
              <div className="plat-bills__pending">
                <PlatformPending
                  compact
                  title="Loading commission invoices"
                  copy="Platform → agent invoices awaiting payment or agent confirm."
                />
                <PlatformTableSkeleton columns={9} rows={8} />
              </div>
            ) : null}

            {!loading && invoices.length === 0 ? (
              <p className="plat-bills__empty">
                No commission invoices yet. Generate invoices for a billing
                period.
              </p>
            ) : null}

            {!loading && invoices.length > 0 && filteredInvoices.length === 0 ? (
              <p className="plat-bills__empty">
                No invoices match “{query.trim()}”.
              </p>
            ) : null}

            {!loading && filteredInvoices.length > 0 ? (
              <>
                <table className="plat-bills__table plat-commissions__table">
                  <colgroup>
                    <col style={{ width: "11.5rem" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "4.5rem" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "8.5rem" }} />
                    <col style={{ width: "8.5rem" }} />
                    <col style={{ width: "10.5rem" }} />
                    <col style={{ width: "10rem" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>
                        <SortHeader
                          label="Period"
                          sortKey="period"
                          sort={invoiceSort}
                          onSort={onInvoiceSort}
                        />
                      </th>
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
                          label="Fee collected"
                          sortKey="fee"
                          sort={invoiceSort}
                          onSort={onInvoiceSort}
                          align="end"
                        />
                      </th>
                      <th className="plat-commissions__th-num">
                        <SortHeader
                          label="Rate"
                          sortKey="rate"
                          sort={invoiceSort}
                          onSort={onInvoiceSort}
                          align="end"
                        />
                      </th>
                      <th className="plat-commissions__th-num">
                        <SortHeader
                          label="Commission"
                          sortKey="commission"
                          sort={invoiceSort}
                          onSort={onInvoiceSort}
                          align="end"
                        />
                      </th>
                      <th>
                        <SortHeader
                          label="Status"
                          sortKey="status"
                          sort={invoiceSort}
                          onSort={onInvoiceSort}
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
                      <th>
                        <SortHeader
                          label="Paid at"
                          sortKey="paidAt"
                          sort={invoiceSort}
                          onSort={onInvoiceSort}
                        />
                      </th>
                      <th className="plat-commissions__th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedInvoices.map((row) => {
                      const txHash = row.txRef?.trim() || "";
                      const paidAt = row.paidAt ?? null;
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
                            openSlip(row, { tab: "invoices" });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openSlip(row, { tab: "invoices" });
                            }
                          }}
                          tabIndex={0}
                          aria-label={`Open ${formatCommissionPeriodLabel(row.periodKey)} invoice for ${row.payeeName}`}
                        >
                          <td className="plat-commissions__period">
                            <button
                              type="button"
                              className="plat-commissions__period-btn"
                              onClick={() =>
                                openSlip(row, { tab: "invoices" })
                              }
                            >
                              {formatCommissionPeriodLabel(row.periodKey)}
                            </button>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <Link
                              className="plat-commissions__agent-link"
                              to={platformRoute(`agents/${row.payeeOrgId}`)}
                            >
                              {row.payeeName}
                            </Link>
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
                          <td>
                            <span
                              className={`plat-commissions__status is-${platformPayoutTone(row.payoutStatus)}`}
                            >
                              {platformPayoutStatusLabel(row.payoutStatus)}
                            </span>
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
                          <td className="plat-commissions__paid-at">
                            {paidAt ? new Date(paidAt).toLocaleString() : "—"}
                          </td>
                          <td
                            className="plat-commissions__actions-cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="plat-commissions__action"
                              onClick={() => openSlip(row, { tab: "invoices" })}
                            >
                              Open invoice
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <OrgListPagination
                  page={invoicesPage}
                  pageCount={invoicesPageCount}
                  total={filteredInvoices.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setInvoicesPage}
                />
              </>
            ) : null}
          </div>
        </>
      ) : tab === "history" ? (
        <>
          {loading ? (
            <div className="plat-bills__table-wrap">
              <div className="plat-bills__pending">
                <PlatformPending
                  compact
                  title="Loading payout history"
                  copy="Settled platform → agent remittances."
                />
                <PlatformTableSkeleton columns={7} rows={6} />
              </div>
            </div>
          ) : history.length === 0 ? (
            <p className="plat-bills__empty">
              No settled platform → agent payouts yet. Invoices move here after
              the agent confirms receipt.
            </p>
          ) : filteredHistory.length === 0 ? (
            <p className="plat-bills__empty">
              No payout history matches “{query.trim()}”.
            </p>
          ) : (
            <div className="plat-bills__table-wrap">
              <table className="plat-bills__table plat-commissions__table">
                <colgroup>
                  <col style={{ width: "11rem" }} />
                  <col style={{ width: "11.5rem" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "7.5rem" }} />
                  <col style={{ width: "18%" }} />
                  <col />
                  <col style={{ width: "7rem" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        label="Settled at"
                        sortKey="paidAt"
                        sort={historySort}
                        onSort={onHistorySort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Period"
                        sortKey="period"
                        sort={historySort}
                        onSort={onHistorySort}
                      />
                    </th>
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
                        align="end"
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Address"
                        sortKey="address"
                        sort={historySort}
                        onSort={onHistorySort}
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
                    <th>
                      <SortHeader
                        label="Status"
                        sortKey="status"
                        sort={historySort}
                        onSort={onHistorySort}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedHistory.map((h) => (
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
                        openSlip(h, { tab: "history" });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openSlip(h, { tab: "history" });
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Review ${formatCommissionPeriodLabel(h.periodKey)} invoice for ${h.payeeName}`}
                    >
                      <td className="plat-commissions__paid-at">
                        {h.settledAt || h.paidAt
                          ? new Date(h.settledAt ?? h.paidAt!).toLocaleString()
                          : "—"}
                      </td>
                      <td className="plat-commissions__period">
                        <button
                          type="button"
                          className="plat-commissions__period-btn"
                          onClick={() => openSlip(h, { tab: "history" })}
                        >
                          {formatCommissionPeriodLabel(h.periodKey)}
                        </button>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Link
                          className="plat-commissions__agent-link"
                          to={platformRoute(`agents/${h.payeeOrgId}`)}
                        >
                          {h.payeeName}
                        </Link>
                      </td>
                      <td className="plat-commissions__num plat-commissions__num--emph">
                        <FundAmount amount={h.commissionAmount} />
                      </td>
                      <td
                        className="plat-commissions__addr"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CopyableChainValue
                          value={h.payoutAddress}
                          network={remittanceNetwork(h)}
                          kind="address"
                          display={
                            h.payoutAddress
                              ? truncateAddress(h.payoutAddress, 5, 5)
                              : undefined
                          }
                        />
                      </td>
                      <td
                        className="plat-commissions__tx"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CopyableChainValue
                          value={h.txRef}
                          network={remittanceNetwork(h)}
                          kind="tx"
                          display={
                            h.txRef
                              ? truncateAddress(h.txRef, 8, 6)
                              : undefined
                          }
                        />
                      </td>
                      <td>
                        <span
                          className={`plat-commissions__status is-${platformPayoutTone(h.payoutStatus)}`}
                        >
                          {platformPayoutStatusLabel(h.payoutStatus)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <OrgListPagination
                page={historyPage}
                pageCount={historyPageCount}
                total={filteredHistory.length}
                pageSize={PAGE_SIZE}
                onPageChange={setHistoryPage}
              />
            </div>
          )}
        </>
      ) : (
        <>
          {cascadeHistory.length === 0 ? (
            <p className="plat-bills__empty">
              No agent → sub payouts recorded yet.
            </p>
          ) : filteredCascade.length === 0 ? (
            <p className="plat-bills__empty">
              No cascade payouts match “{query.trim()}”.
            </p>
          ) : (
            <div className="plat-bills__table-wrap">
              <table className="plat-bills__table plat-commissions__table">
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        label="Paid at"
                        sortKey="paidAt"
                        sort={cascadeSort}
                        onSort={onCascadeSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Period"
                        sortKey="period"
                        sort={cascadeSort}
                        onSort={onCascadeSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Sub-agent"
                        sortKey="subAgent"
                        sort={cascadeSort}
                        onSort={onCascadeSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Payer agent"
                        sortKey="payer"
                        sort={cascadeSort}
                        onSort={onCascadeSort}
                      />
                    </th>
                    <th className="plat-commissions__th-num">
                      <SortHeader
                        label="Amount"
                        sortKey="amount"
                        sort={cascadeSort}
                        onSort={onCascadeSort}
                        align="end"
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Address"
                        sortKey="address"
                        sort={cascadeSort}
                        onSort={onCascadeSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Tx / ref"
                        sortKey="tx"
                        sort={cascadeSort}
                        onSort={onCascadeSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Status"
                        sortKey="status"
                        sort={cascadeSort}
                        onSort={onCascadeSort}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCascade.map((h) => (
                    <tr key={h.id} className="plat-bills__row">
                      <td className="plat-commissions__paid-at">
                        {h.paidAt
                          ? new Date(h.paidAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="plat-commissions__period">
                        {formatCommissionPeriodLabel(h.periodKey)}
                      </td>
                      <td>
                        <Link
                          className="plat-commissions__agent-link"
                          to={platformRoute(`agents/${h.payeeOrgId}`)}
                        >
                          {h.payeeName}
                        </Link>
                      </td>
                      <td>
                        {h.payerOrgId ? (
                          <Link
                            className="plat-commissions__agent-link"
                            to={platformRoute(`agents/${h.payerOrgId}`)}
                          >
                            {byId.get(h.payerOrgId)?.name ?? h.payerOrgId}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="plat-commissions__num plat-commissions__num--emph">
                        <FundAmount amount={h.commissionAmount} />
                      </td>
                      <td
                        className="plat-commissions__addr"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CopyableChainValue
                          value={h.payoutAddress}
                          network={remittanceNetwork(h)}
                          kind="address"
                          display={
                            h.payoutAddress
                              ? truncateAddress(h.payoutAddress, 5, 5)
                              : undefined
                          }
                        />
                      </td>
                      <td className="plat-commissions__tx">
                        <CopyableChainValue
                          value={h.txRef}
                          network={remittanceNetwork(h)}
                          kind="tx"
                          display={
                            h.txRef
                              ? truncateAddress(h.txRef, 8, 6)
                              : undefined
                          }
                        />
                      </td>
                      <td>
                        <span
                          className={`plat-commissions__status is-${cascadePayoutTone(h.payoutStatus)}`}
                        >
                          {cascadePayoutStatusLabel(h.payoutStatus)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <OrgListPagination
                page={cascadePage}
                pageCount={cascadePageCount}
                total={filteredCascade.length}
                pageSize={PAGE_SIZE}
                onPageChange={setCascadePage}
              />
            </div>
          )}
        </>
      )}

      {slip
        ? createPortal(
            <CommissionInvoiceModal
              slip={slip}
              dest={slipDest}
              kicker="Platform → agent"
              byId={byId}
              orgHref={orgDetailHref}
              canPay={canPay}
              canConfirmReceipt={false}
              paidNote={paidNote}
              onPaidNoteChange={setPaidNote}
              onConfirmPay={() => void onConfirmPay()}
              onConfirmReceipt={() => {}}
              busy={busy}
              onClose={closeSlip}
              missingAddressHint="No payout address on this agent yet. Set it on the agent detail page before sending funds."
            />,
            document.body,
          )
        : null}
    </div>
  );
}
