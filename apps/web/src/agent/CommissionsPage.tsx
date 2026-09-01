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
import {
  CommissionInvoiceModal,
  destForInvoice,
  invoiceStatusLabel,
  invoiceStatusTone,
} from "../commercial/CommissionInvoiceModal";
import {
  commissionHistoryFromBills,
  formatCommissionPeriodLabel,
} from "../commercial/commissionStatements";
import {
  listCommissionPayouts,
  markCommissionPayoutPaid,
  agentConfirmCommissionPayout,
  generateSubAgentCommissionInvoices,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import { FundAmount } from "../platform/FundAmount";
import { OrgListPagination } from "../platform/OrgListPagination";
import {
  DEFAULT_AGENT_COMMISSION_PERCENT,
  truncateAddress,
} from "../platform/orgDetailSeeds";
import {
  PlatformPending,
  PlatformTableSkeleton,
} from "../platform/ui/PlatformPending";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import {
  ApiError,
  listAgentCommissions,
  listAgentPayoutAddresses,
  type OrgAccount,
  type Session,
} from "./api";
import {
  merchantsInAgentSubtree,
  subAgentsInAgentSubtree,
} from "./agentSubtree";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import { getAgentServiceBills } from "./agentServiceBillsList";
import { primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";
import { agentRoute } from "../shared/portalRouting";

type Props = { session: Session };

const PAGE_SIZE = 15;

type CommissionsTab = "current" | "history";

function parseCommissionsTab(raw: string | null): CommissionsTab {
  return raw === "history" ? "history" : "current";
}

function isOpenInvoice(status: string): boolean {
  return (
    status === "issued" ||
    status === "ready" ||
    status === "verifying" ||
    status === "paid"
  );
}

function agentInvoiceOrgHref(
  type: string,
  id: string,
  parentId: string | null,
): string | null {
  if (type === "merchant") return agentRoute(`merchants/${id}`);
  if (type === "merchant_site") {
    return parentId
      ? `${agentRoute(`merchants/${parentId}`)}?tab=sites`
      : agentRoute(`merchants/${id}`);
  }
  if (type === "agent_sub") return agentRoute(`agents/${id}`);
  return null;
}

export function CommissionsPage({ session }: Props) {
  const agentId = primaryAgentOrgId(session);
  const canManage = useMemo(
    () => sessionCanOnboardMerchant(session),
    [session],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<
    ReturnType<typeof commissionHistoryFromBills>
  >([]);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [percent, setPercent] = useState(DEFAULT_AGENT_COMMISSION_PERCENT);
  const [payoutAddrs, setPayoutAddrs] = useState<
    Map<string, { address: string; asset: string; network: string }>
  >(() => new Map());
  const [loading, setLoading] = useState(() => peekAgentOrgs() == null);
  const [hasLoaded, setHasLoaded] = useState(() => peekAgentOrgs() != null);
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);
  const [agentPayouts, setAgentPayouts] = useState<CommissionPayoutRecord[]>(
    [],
  );
  const [platformInvoices, setPlatformInvoices] = useState<
    CommissionPayoutRecord[]
  >([]);
  const [parentInvoices, setParentInvoices] = useState<
    CommissionPayoutRecord[]
  >([]);
  const [slip, setSlip] = useState<CommissionPayoutRecord | null>(null);
  const [paidNote, setPaidNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [issuePeriod, setIssuePeriod] = useState("");
  const [subPayoutsPage, setSubPayoutsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const tab = parseCommissionsTab(searchParams.get("tab"));

  const selectTab = useCallback(
    (next: CommissionsTab) => {
      const params = new URLSearchParams(searchParams);
      if (next === "current") params.delete("tab");
      else params.set("tab", next);
      params.delete("payee");
      params.delete("period");
      params.delete("from");
      setSearchParams(params, { replace: true });
      setSlip(null);
      setPaidNote("");
    },
    [searchParams, setSearchParams],
  );

  const dismissToast = useCallback(() => setError(null), []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("agent-topbar-center"));
    setTopbarActionsSlot(document.getElementById("agent-topbar-actions"));
  }, []);

  const refreshPayouts = useCallback(async () => {
    if (!agentId) {
      setAgentPayouts([]);
      setPlatformInvoices([]);
      setParentInvoices([]);
      return;
    }
    const [subRows, platformRows, parentRows] = await Promise.all([
      listCommissionPayouts({
        payer: "agent",
        payerOrgId: agentId,
      }),
      listCommissionPayouts({
        payer: "platform",
        payeeOrgId: agentId,
      }),
      listCommissionPayouts({
        payer: "agent",
        payeeOrgId: agentId,
      }),
    ]);
    setAgentPayouts(subRows);
    setPlatformInvoices(platformRows);
    setParentInvoices(parentRows);
  }, [agentId]);

  const load = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      setError("No agent membership on this session");
      return;
    }
    if (!hasLoaded) setLoading(true);
    setError(null);
    try {
      const [
        orgRows,
        bills,
        commissions,
        payoutAddrRows,
        agentPayoutRows,
        platformRows,
        parentRows,
      ] = await Promise.all([
        getAgentOrgs(),
        getAgentServiceBills(),
        listAgentCommissions(),
        listAgentPayoutAddresses(),
        listCommissionPayouts({
          payer: "agent",
          payerOrgId: agentId,
        }),
        listCommissionPayouts({
          payer: "platform",
          payeeOrgId: agentId,
        }),
        listCommissionPayouts({
          payer: "agent",
          payeeOrgId: agentId,
        }),
      ]);
      setOrgs(orgRows);
      const own =
        commissions.find((c) => c.orgId === agentId)?.commissionPercent?.trim() ||
        DEFAULT_AGENT_COMMISSION_PERCENT;
      setPercent(own);
      const merchantIds = new Set(
        merchantsInAgentSubtree(agentId, orgRows).map((m) => m.id),
      );
      setRows(commissionHistoryFromBills(bills, merchantIds, own));

      const addrMap = new Map<
        string,
        { address: string; asset: string; network: string }
      >();
      for (const payout of payoutAddrRows) {
        if (!payout.address) continue;
        addrMap.set(payout.orgId, {
          address: payout.address,
          asset: payout.asset,
          network: payout.network,
        });
      }
      setPayoutAddrs(addrMap);
      setAgentPayouts(agentPayoutRows);
      setPlatformInvoices(platformRows);
      setParentInvoices(parentRows);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : err instanceof Error
            ? err.message
            : "Failed to load commission statements",
      );
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [agentId, hasLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const selfOrg = agentId ? byId.get(agentId) : null;
  const isTopLevel = useMemo(() => {
    if (!selfOrg) return true;
    if (!selfOrg.parentId) return true;
    const parent = byId.get(selfOrg.parentId);
    return parent?.type === "platform" || parent == null;
  }, [selfOrg, byId]);

  const subs = useMemo(() => {
    if (!agentId) return [];
    return subAgentsInAgentSubtree(agentId, orgs).filter(
      (s) => s.parentId === agentId,
    );
  }, [agentId, orgs]);

  const mtd = useMemo(() => {
    const key = new Date().toISOString().slice(0, 7);
    return (
      platformInvoices.find((r) => r.periodKey === key) ??
      rows.find((r) => r.periodKey === key) ??
      platformInvoices[0] ??
      rows[0] ??
      null
    );
  }, [rows, platformInvoices]);

  const receivedInvoices = useMemo(() => {
    const source = isTopLevel ? platformInvoices : parentInvoices;
    return source.filter(
      (p) => p.payoutStatus === "paid" || p.payoutStatus === "settled",
    );
  }, [isTopLevel, platformInvoices, parentInvoices]);

  const receivedPeriods = useMemo(() => {
    const keys = [...new Set(receivedInvoices.map((p) => p.periodKey))];
    return keys.sort((a, b) => b.localeCompare(a));
  }, [receivedInvoices]);

  useEffect(() => {
    if (!issuePeriod && receivedPeriods[0]) {
      setIssuePeriod(receivedPeriods[0]);
    } else if (
      issuePeriod &&
      receivedPeriods.length > 0 &&
      !receivedPeriods.includes(issuePeriod)
    ) {
      setIssuePeriod(receivedPeriods[0]);
    }
  }, [issuePeriod, receivedPeriods]);

  const openPlatformInvoices = useMemo(
    () => platformInvoices.filter((p) => isOpenInvoice(p.payoutStatus)),
    [platformInvoices],
  );
  const settledPlatformInvoices = useMemo(
    () => platformInvoices.filter((p) => p.payoutStatus === "settled"),
    [platformInvoices],
  );
  const openParentInvoices = useMemo(
    () => parentInvoices.filter((p) => isOpenInvoice(p.payoutStatus)),
    [parentInvoices],
  );
  const settledParentInvoices = useMemo(
    () => parentInvoices.filter((p) => p.payoutStatus === "settled"),
    [parentInvoices],
  );
  const openSubInvoices = useMemo(
    () => agentPayouts.filter((p) => isOpenInvoice(p.payoutStatus)),
    [agentPayouts],
  );
  const settledSubInvoices = useMemo(
    () => agentPayouts.filter((p) => p.payoutStatus === "settled"),
    [agentPayouts],
  );

  const subPayoutsPageCount = Math.max(
    1,
    Math.ceil(openSubInvoices.length / PAGE_SIZE),
  );
  const pagedSubPayouts = useMemo(() => {
    const start = (subPayoutsPage - 1) * PAGE_SIZE;
    return openSubInvoices.slice(start, start + PAGE_SIZE);
  }, [openSubInvoices, subPayoutsPage]);

  const historyPageCount = Math.max(
    1,
    Math.ceil(settledSubInvoices.length / PAGE_SIZE),
  );
  const pagedHistory = useMemo(() => {
    const start = (historyPage - 1) * PAGE_SIZE;
    return settledSubInvoices.slice(start, start + PAGE_SIZE);
  }, [settledSubInvoices, historyPage]);

  useEffect(() => {
    setSubPayoutsPage(1);
  }, [openSubInvoices.length]);

  useEffect(() => {
    setHistoryPage(1);
  }, [settledSubInvoices.length]);

  useEffect(() => {
    if (subPayoutsPage > subPayoutsPageCount) {
      setSubPayoutsPage(subPayoutsPageCount);
    }
  }, [subPayoutsPage, subPayoutsPageCount]);

  useEffect(() => {
    if (historyPage > historyPageCount) setHistoryPage(historyPageCount);
  }, [historyPage, historyPageCount]);

  function writeInvoiceParams(record: CommissionPayoutRecord | null) {
    const params = new URLSearchParams();
    if (tab === "history") params.set("tab", "history");
    if (record) {
      params.set("period", record.periodKey);
      if (record.payer === "platform") params.set("from", "platform");
      else params.set("payee", record.payeeOrgId);
    }
    setSearchParams(params, { replace: true });
  }

  function openInvoice(record: CommissionPayoutRecord) {
    setPaidNote(record.note?.trim() ?? "");
    setSlip(record);
    writeInvoiceParams(record);
  }

  function closeSlip() {
    setSlip(null);
    setPaidNote("");
    writeInvoiceParams(null);
  }

  useEffect(() => {
    const payee = searchParams.get("payee");
    const period = searchParams.get("period");
    const from = searchParams.get("from");
    if (!period) return;
    if (from === "platform") {
      const match = platformInvoices.find((p) => p.periodKey === period);
      if (match) {
        setPaidNote(match.note?.trim() ?? "");
        setSlip(match);
      }
      return;
    }
    if (payee) {
      const match =
        agentPayouts.find(
          (p) => p.payeeOrgId === payee && p.periodKey === period,
        ) ??
        parentInvoices.find(
          (p) => p.payeeOrgId === payee && p.periodKey === period,
        ) ??
        platformInvoices.find(
          (p) => p.payeeOrgId === payee && p.periodKey === period,
        );
      if (match) {
        setPaidNote(match.note?.trim() ?? "");
        setSlip(match);
      }
    }
  }, [searchParams, agentPayouts, platformInvoices, parentInvoices]);

  async function onIssueSubInvoices() {
    if (!canManage || !agentId || !issuePeriod) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateSubAgentCommissionInvoices({
        periodKey: issuePeriod,
        payerOrgId: agentId,
      });
      await refreshPayouts();
      if (result.created.length === 0 && result.skipped.length === 0) {
        setError("No direct sub-agents to invoice for this period.");
      } else if (result.created.length === 0 && result.skipped.length > 0) {
        setError(
          `No invoices created for ${formatCommissionPeriodLabel(issuePeriod)} — already issued or paid.`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to issue sub-agent invoices",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmPay() {
    if (!slip || !canManage) return;
    if (slip.payer !== "agent" || slip.payerOrgId !== agentId) return;
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

  async function onConfirmReceipt() {
    if (!slip || !canManage || slip.payeeOrgId !== agentId) return;
    if (slip.payoutStatus !== "paid") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await agentConfirmCommissionPayout(slip.id);
      await refreshPayouts();
      if (updated) setSlip(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to confirm commission",
      );
    } finally {
      setBusy(false);
    }
  }

  const slipDest = slip
    ? destForInvoice(slip, payoutAddrs.get(slip.payeeOrgId) ?? null)
    : null;
  const slipKicker =
    slip?.payer === "platform"
      ? "Platform → agent"
      : slip?.payeeOrgId === agentId
        ? "Parent agent → you"
        : "Agent → sub-agent";
  const canPaySlip = Boolean(
    slip &&
      canManage &&
      slip.payer === "agent" &&
      slip.payerOrgId === agentId,
  );
  const canConfirmSlip = Boolean(
    slip && canManage && slip.payeeOrgId === agentId,
  );

  function invoiceRow(
    inv: CommissionPayoutRecord,
    opts: { showPayee?: boolean; actions?: "payer" | "payee" },
  ) {
    return (
      <tr
        key={inv.id}
        className="plat-bills__row plat-commissions__row--review"
        onClick={(e) => {
          if (
            (e.target as HTMLElement).closest("a, button, .chain-value")
          ) {
            return;
          }
          openInvoice(inv);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openInvoice(inv);
          }
        }}
        tabIndex={0}
        aria-label={`Open ${formatCommissionPeriodLabel(inv.periodKey)} invoice`}
      >
        {opts.showPayee ? (
          <td onClick={(e) => e.stopPropagation()}>
            <Link
              className="plat-commissions__agent-link"
              to={agentRoute(`agents/${inv.payeeOrgId}`)}
            >
              {inv.payeeName}
            </Link>
          </td>
        ) : null}
        <td className="plat-commissions__period">
          <button
            type="button"
            className="plat-commissions__period-btn"
            onClick={() => openInvoice(inv)}
          >
            {formatCommissionPeriodLabel(inv.periodKey)}
          </button>
        </td>
        <td className="plat-commissions__num">
          <FundAmount amount={inv.platformFeeCollected} />
        </td>
        <td className="plat-commissions__rate-cell">
          {inv.commissionPercent}%
        </td>
        <td className="plat-commissions__num plat-commissions__num--emph">
          <FundAmount amount={inv.commissionAmount} />
        </td>
        <td>
          <span
            className={`plat-commissions__status is-${invoiceStatusTone(inv.payoutStatus)}`}
          >
            {invoiceStatusLabel(inv.payoutStatus)}
          </span>
        </td>
        <td
          className="plat-commissions__tx"
          onClick={(e) => e.stopPropagation()}
        >
          <CopyableChainValue
            value={inv.txRef}
            network={inv.network?.trim() || "tron"}
            kind="tx"
            display={inv.txRef ? truncateAddress(inv.txRef, 8, 6) : undefined}
          />
        </td>
        <td
          className="plat-commissions__actions-cell"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="plat-commissions__row-actions">
            <button
              type="button"
              className="plat-commissions__action"
              onClick={() => openInvoice(inv)}
            >
              Open invoice
            </button>
            {opts.actions === "payee" &&
            canManage &&
            inv.payoutStatus === "paid" ? (
              <button
                type="button"
                className="plat-commissions__action plat-commissions__action--primary"
                disabled={busy}
                onClick={() => {
                  openInvoice(inv);
                }}
              >
                Confirm receipt
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  function historyRow(
    inv: CommissionPayoutRecord,
    opts: { showPayee?: boolean },
  ) {
    return (
      <tr
        key={inv.id}
        className="plat-bills__row plat-commissions__row--review"
        onClick={(e) => {
          if (
            (e.target as HTMLElement).closest("a, button, .chain-value")
          ) {
            return;
          }
          openInvoice(inv);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openInvoice(inv);
          }
        }}
        tabIndex={0}
        aria-label={`Open ${formatCommissionPeriodLabel(inv.periodKey)} invoice`}
      >
        <td className="plat-commissions__paid-at">
          {inv.settledAt
            ? new Date(inv.settledAt).toLocaleString()
            : inv.paidAt
              ? new Date(inv.paidAt).toLocaleString()
              : "—"}
        </td>
        {opts.showPayee ? <td>{inv.payeeName}</td> : null}
        <td className="plat-commissions__period">
          <button
            type="button"
            className="plat-commissions__period-btn"
            onClick={() => openInvoice(inv)}
          >
            {formatCommissionPeriodLabel(inv.periodKey)}
          </button>
        </td>
        <td className="plat-commissions__num plat-commissions__num--emph">
          <FundAmount amount={inv.commissionAmount} />
        </td>
        <td
          className="plat-commissions__tx"
          onClick={(e) => e.stopPropagation()}
        >
          <CopyableChainValue
            value={inv.txRef}
            network={inv.network?.trim() || "tron"}
            kind="tx"
            display={inv.txRef ? truncateAddress(inv.txRef, 8, 6) : undefined}
          />
        </td>
        <td>
          <span className="plat-commissions__status is-settled">Settled</span>
        </td>
      </tr>
    );
  }

  const mtdStatus =
    mtd && "payoutStatus" in mtd ? String(mtd.payoutStatus) : "";
  const mtdCommission =
    mtd && "commissionAmount" in mtd ? Number(mtd.commissionAmount) : 0;
  const mtdFee =
    mtd && "platformFeeCollected" in mtd
      ? Number(mtd.platformFeeCollected)
      : 0;
  const mtdPeriod =
    mtd && "periodKey" in mtd ? String(mtd.periodKey) : "";

  return (
    <div className="plat-bills plat-commissions">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      {topbarSlot
        ? createPortal(
            <p className="plat-commissions__topbar-title">
              Commission statements
            </p>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <button
              type="button"
              className="btn-secondary org-agents__cta"
              onClick={() => window.print()}
            >
              Print / PDF
            </button>,
            topbarActionsSlot,
          )
        : null}

      <div className="plat-commissions__summary">
        <div className="plat-commissions__kpis">
          <article className="plat-commissions__kpi">
            <p className="plat-commissions__eyebrow">Rebate rate</p>
            <p className="plat-commissions__rate">
              {percent}
              <span>%</span>
            </p>
          </article>
          {mtd ? (
            <article className="plat-commissions__kpi plat-commissions__kpi--statement">
              <p className="plat-commissions__eyebrow">
                {formatCommissionPeriodLabel(mtdPeriod)}
              </p>
              <p className="plat-commissions__mtd-value">
                <FundAmount amount={mtdCommission} />
              </p>
              <div className="plat-commissions__kpi-meta">
                <span>
                  Fee base <FundAmount amount={mtdFee} />
                </span>
                {mtdStatus ? (
                  <span
                    className={`plat-commissions__status is-${invoiceStatusTone(mtdStatus)}`}
                  >
                    {invoiceStatusLabel(mtdStatus)}
                  </span>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>
      </div>

      <div
        className="b3-agent-detail__tabs plat-commissions__tabs"
        role="tablist"
        aria-label="Commission view"
      >
        <button
          type="button"
          role="tab"
          className={`b3-agent-detail__tab${tab === "current" ? " is-active" : ""}`}
          aria-selected={tab === "current"}
          onClick={() => selectTab("current")}
        >
          Current
        </button>
        <button
          type="button"
          role="tab"
          className={`b3-agent-detail__tab${tab === "history" ? " is-active" : ""}`}
          aria-selected={tab === "history"}
          onClick={() => selectTab("history")}
        >
          History
        </button>
      </div>

      {tab === "current" ? (
        <>
          {loading && !hasLoaded ? (
            <div className="plat-bills__pending">
              <PlatformPending
                compact
                title="Loading commissions"
                copy="Aggregating subtree service bills into monthly statements."
              />
              <PlatformTableSkeleton columns={6} rows={4} />
            </div>
          ) : null}

          {!loading && isTopLevel ? (
            <>
              <h2 className="plat-commissions__history-title">From platform</h2>
              {openPlatformInvoices.length === 0 ? (
                <p className="plat-bills__empty">
                  No pending or unconfirmed invoices from the platform.
                </p>
              ) : (
                <div className="plat-bills__table-wrap">
                  <table className="plat-bills__table plat-commissions__table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th className="plat-commissions__th-num">
                          Fee collected
                        </th>
                        <th className="plat-commissions__th-num">Rate</th>
                        <th className="plat-commissions__th-num">Commission</th>
                        <th>Status</th>
                        <th>Tx / ref</th>
                        <th className="plat-commissions__th-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPlatformInvoices.map((inv) =>
                        invoiceRow(inv, { actions: "payee" }),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          {!loading && (isTopLevel || subs.length > 0) ? (
            <>
              <div className="plat-commissions__section-head">
                <h2 className="plat-commissions__history-title">
                  To sub-agents
                </h2>
                {canManage && receivedPeriods.length > 0 && subs.length > 0 ? (
                  <div className="plat-commissions__generate">
                    <label className="plat-commissions__period-input">
                      <span className="sr-only">Sub-agent invoice period</span>
                      <select
                        className="field-control plat-commissions__period-control"
                        value={issuePeriod}
                        onChange={(e) => setIssuePeriod(e.target.value)}
                        aria-label="Sub-agent invoice period"
                      >
                        {receivedPeriods.map((key) => (
                          <option key={key} value={key}>
                            {formatCommissionPeriodLabel(key)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn-primary org-agents__cta"
                      disabled={busy || !issuePeriod}
                      onClick={() => void onIssueSubInvoices()}
                    >
                      {busy ? "Issuing…" : "Issue invoices"}
                    </button>
                  </div>
                ) : null}
              </div>
              {subs.length === 0 ? (
                <p className="plat-bills__empty">
                  No sub-agents yet.{" "}
                  <Link to={agentRoute("agents/new")}>Onboard a sub-agent</Link>
                </p>
              ) : receivedPeriods.length === 0 && openSubInvoices.length === 0 ? (
                <p className="plat-bills__empty">
                  After you receive a platform commission, issue invoices here
                  and pay your sub-agents.
                </p>
              ) : openSubInvoices.length === 0 ? (
                <p className="plat-bills__empty">
                  No open sub-agent invoices. Issue invoices for a received
                  period, then open the invoice to pay.
                </p>
              ) : (
                <div className="plat-bills__table-wrap">
                  <table className="plat-bills__table plat-commissions__table">
                    <thead>
                      <tr>
                        <th>Sub-agent</th>
                        <th>Period</th>
                        <th className="plat-commissions__th-num">Fee base</th>
                        <th className="plat-commissions__th-num">Rate</th>
                        <th className="plat-commissions__th-num">Amount</th>
                        <th>Status</th>
                        <th>Tx / ref</th>
                        <th className="plat-commissions__th-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSubPayouts.map((inv) =>
                        invoiceRow(inv, { showPayee: true, actions: "payer" }),
                      )}
                    </tbody>
                  </table>
                  <OrgListPagination
                    page={subPayoutsPage}
                    pageCount={subPayoutsPageCount}
                    total={openSubInvoices.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setSubPayoutsPage}
                  />
                </div>
              )}
            </>
          ) : null}

          {!loading && !isTopLevel ? (
            <>
              <h2 className="plat-commissions__history-title">
                From parent agent
              </h2>
              {openParentInvoices.length === 0 ? (
                <p className="plat-bills__empty">
                  No open payouts from your parent agent.
                </p>
              ) : (
                <div className="plat-bills__table-wrap">
                  <table className="plat-bills__table plat-commissions__table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th className="plat-commissions__th-num">Fee base</th>
                        <th className="plat-commissions__th-num">Rate</th>
                        <th className="plat-commissions__th-num">Commission</th>
                        <th>Status</th>
                        <th>Tx / ref</th>
                        <th className="plat-commissions__th-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openParentInvoices.map((inv) =>
                        invoiceRow(inv, { actions: "payee" }),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </>
      ) : (
        <>
          {isTopLevel ? (
            <>
              <h2 className="plat-commissions__history-title">From platform</h2>
              {settledPlatformInvoices.length === 0 ? (
                <p className="plat-bills__empty">
                  No confirmed platform invoices yet. Confirm receipt on Current
                  after remittance.
                </p>
              ) : (
                <div className="plat-bills__table-wrap">
                  <table className="plat-bills__table plat-commissions__table">
                    <thead>
                      <tr>
                        <th>Settled at</th>
                        <th>Period</th>
                        <th className="plat-commissions__th-num">Amount</th>
                        <th>Tx / ref</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settledPlatformInvoices.map((inv) =>
                        historyRow(inv, {}),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          {isTopLevel || subs.length > 0 ? (
            <>
              <h2 className="plat-commissions__history-title">To sub-agents</h2>
              {settledSubInvoices.length === 0 ? (
                <p className="plat-bills__empty">
                  No settled sub-agent invoices yet. Pay the invoice, then the
                  sub-agent confirms receipt.
                </p>
              ) : (
                <div className="plat-bills__table-wrap">
                  <table className="plat-bills__table plat-commissions__table">
                    <thead>
                      <tr>
                        <th>Settled at</th>
                        <th>Sub-agent</th>
                        <th>Period</th>
                        <th className="plat-commissions__th-num">Amount</th>
                        <th>Tx / ref</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistory.map((h) =>
                        historyRow(h, { showPayee: true }),
                      )}
                    </tbody>
                  </table>
                  <OrgListPagination
                    page={historyPage}
                    pageCount={historyPageCount}
                    total={settledSubInvoices.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setHistoryPage}
                  />
                </div>
              )}
            </>
          ) : null}

          {!isTopLevel ? (
            <>
              <h2 className="plat-commissions__history-title">
                From parent agent
              </h2>
              {settledParentInvoices.length === 0 ? (
                <p className="plat-bills__empty">
                  No confirmed payouts from your parent agent yet.
                </p>
              ) : (
                <div className="plat-bills__table-wrap">
                  <table className="plat-bills__table plat-commissions__table">
                    <thead>
                      <tr>
                        <th>Settled at</th>
                        <th>Period</th>
                        <th className="plat-commissions__th-num">Amount</th>
                        <th>Tx / ref</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settledParentInvoices.map((h) => historyRow(h, {}))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      {slip
        ? createPortal(
            <CommissionInvoiceModal
              slip={slip}
              dest={slipDest}
              kicker={slipKicker}
              byId={byId}
              orgHref={agentInvoiceOrgHref}
              canPay={canPaySlip}
              canConfirmReceipt={canConfirmSlip}
              paidNote={paidNote}
              onPaidNoteChange={setPaidNote}
              onConfirmPay={() => void onConfirmPay()}
              onConfirmReceipt={() => void onConfirmReceipt()}
              busy={busy}
              onClose={closeSlip}
              missingAddressHint="No payout address on this agent yet. They must set it under Settings, then reopen this invoice."
            />,
            document.body,
          )
        : null}
    </div>
  );
}
