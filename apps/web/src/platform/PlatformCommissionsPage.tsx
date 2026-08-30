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
import { commissionHistoryFromBills } from "../commercial/commissionStatements";
import {
  findPayout,
  listCommissionPayouts,
  markCommissionPayoutPaid,
  mergeStatementWithPayout,
  paymentLinkForPlatformPayout,
  upsertCommissionPayout,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import { merchantOrgIdsInAgentSubtree } from "./agentSubtree";
import {
  ApiError,
  listAgentCommissions,
  listAgentPayoutAddresses,
  getPlatformOrgs,
  getPlatformServiceBills,
  type OrgAccount,
  type ServiceBill,
  type Session,
} from "./api";
import { FundAmount } from "./FundAmount";
import { OrgListPagination } from "./OrgListPagination";
import { DEFAULT_AGENT_COMMISSION_PERCENT } from "./orgDetailSeeds";
import { sessionCanIssueServiceBill, sessionIsPlatformViewerOnly } from "./org";
import { PlatformPending, PlatformTableSkeleton } from "./ui/PlatformPending";

type Props = { session: Session };

type AgentPeriodRow = {
  agentId: string;
  agentName: string;
  periodKey: string;
  periodLabel: string;
  platformFeeCollected: number;
  commissionPercent: string;
  commissionAmount: number;
  payoutStatus: "paid" | "pending" | "scheduled" | "ready";
  payout: CommissionPayoutRecord | null;
};

type CommissionsTab = "agent" | "sub-agent";

const TABS: { id: CommissionsTab; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "sub-agent", label: "Sub-agent" },
];

const AGENT_TYPES = new Set(["agent", "agent_sub"]);
const PAGE_SIZE = 10;

function parseCommissionsTab(raw: string | null): CommissionsTab {
  return raw === "sub-agent" ? "sub-agent" : "agent";
}

function payoutTone(status: string): string {
  if (status === "paid") return "paid";
  if (status === "pending") return "pending";
  if (status === "ready") return "ready";
  return "scheduled";
}

function isTopLevelAgent(
  org: OrgAccount,
  byId: Map<string, OrgAccount>,
): boolean {
  if (!AGENT_TYPES.has(org.type)) return false;
  if (!org.parentId) return true;
  const parent = byId.get(org.parentId);
  return parent?.type === "platform";
}

function qrUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data)}`;
}

/** B12 — Platform → top-level agent commission statements & payout slips. */
export function PlatformCommissionsPage({ session }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<CommissionsTab>(() =>
    parseCommissionsTab(searchParams.get("tab")),
  );
  const [copiedKey, setCopiedKey] = useState<"address" | "link" | null>(null);
  const canPay = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const isViewer = useMemo(
    () => sessionIsPlatformViewerOnly(session),
    [session],
  );

  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [percentByAgent, setPercentByAgent] = useState<Map<string, string>>(
    () => new Map(),
  );
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
  const [slip, setSlip] = useState<AgentPeriodRow | null>(null);
  const [txRef, setTxRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [statementsPage, setStatementsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [cascadePage, setCascadePage] = useState(1);

  const dismissToast = useCallback(() => setError(null), []);

  const writeSearchParams = useCallback(
    (next: {
      tab?: CommissionsTab;
      payee?: string | null;
      period?: string | null;
    }) => {
      const params = new URLSearchParams();
      const nextTab = next.tab ?? tab;
      if (nextTab !== "agent") params.set("tab", nextTab);
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
      payee: next === "agent" ? searchParams.get("payee") : null,
      period: next === "agent" ? searchParams.get("period") : null,
    });
    if (next !== "agent") {
      setSlip(null);
      setTxRef("");
      setCopiedKey(null);
    }
  }

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
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
      const [orgRows, billRows, commissions, payoutAddrs, payoutRows] =
        await Promise.all([
          getPlatformOrgs(),
          getPlatformServiceBills(),
          listAgentCommissions(),
          listAgentPayoutAddresses(),
          listCommissionPayouts(),
        ]);
      setOrgs(orgRows);
      setBills(billRows);

      const pctMap = new Map<string, string>();
      for (const c of commissions) {
        pctMap.set(
          c.orgId,
          c.commissionPercent?.trim() || DEFAULT_AGENT_COMMISSION_PERCENT,
        );
      }
      setPercentByAgent(pctMap);

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
            : "Failed to load commission history",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const topAgents = useMemo(
    () => orgs.filter((o) => isTopLevelAgent(o, byId)),
    [orgs, byId],
  );

  const payoutByKey = useMemo(() => {
    const map = new Map<string, CommissionPayoutRecord>();
    for (const p of platformPayouts) {
      map.set(`${p.payeeOrgId}:${p.periodKey}`, p);
    }
    return map;
  }, [platformPayouts]);

  const rows = useMemo((): AgentPeriodRow[] => {
    const out: AgentPeriodRow[] = [];
    for (const agent of topAgents) {
      const merchantIds = merchantOrgIdsInAgentSubtree(agent.id, orgs);
      const pct =
        percentByAgent.get(agent.id) ?? DEFAULT_AGENT_COMMISSION_PERCENT;
      const statements = commissionHistoryFromBills(bills, merchantIds, pct);
      for (const s of statements) {
        const saved = payoutByKey.get(`${agent.id}:${s.periodKey}`);
        const merged = mergeStatementWithPayout(s, saved);
        out.push({
          agentId: agent.id,
          agentName: agent.name,
          periodKey: merged.periodKey,
          periodLabel: merged.periodLabel,
          platformFeeCollected: merged.platformFeeCollected,
          commissionPercent: merged.commissionPercent,
          commissionAmount: merged.commissionAmount,
          payoutStatus: saved
            ? saved.payoutStatus
            : merged.payoutStatus === "pending"
              ? "pending"
              : "scheduled",
          payout: saved ?? null,
        });
      }
    }
    return out.sort((a, b) => {
      const p = b.periodKey.localeCompare(a.periodKey);
      if (p !== 0) return p;
      return a.agentName.localeCompare(b.agentName);
    });
  }, [topAgents, orgs, bills, percentByAgent, payoutByKey]);

  const history = platformPayouts;
  const cascadeHistory = cascadePayouts;

  const statementsPageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (statementsPage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, statementsPage]);

  const historyPageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const pagedHistory = useMemo(() => {
    const start = (historyPage - 1) * PAGE_SIZE;
    return history.slice(start, start + PAGE_SIZE);
  }, [history, historyPage]);

  const cascadePageCount = Math.max(1, Math.ceil(cascadeHistory.length / PAGE_SIZE));
  const pagedCascade = useMemo(() => {
    const start = (cascadePage - 1) * PAGE_SIZE;
    return cascadeHistory.slice(start, start + PAGE_SIZE);
  }, [cascadeHistory, cascadePage]);

  useEffect(() => {
    setStatementsPage(1);
  }, [rows.length]);

  useEffect(() => {
    setHistoryPage(1);
  }, [history.length]);

  useEffect(() => {
    setCascadePage(1);
  }, [cascadeHistory.length]);

  useEffect(() => {
    if (statementsPage > statementsPageCount) setStatementsPage(statementsPageCount);
  }, [statementsPage, statementsPageCount]);

  useEffect(() => {
    if (historyPage > historyPageCount) setHistoryPage(historyPageCount);
  }, [historyPage, historyPageCount]);

  useEffect(() => {
    if (cascadePage > cascadePageCount) setCascadePage(cascadePageCount);
  }, [cascadePage, cascadePageCount]);

  useEffect(() => {
    const payee = searchParams.get("payee");
    const period = searchParams.get("period");
    if (!payee || !period || rows.length === 0) return;
    setTab("agent");
    const match = rows.find(
      (r) => r.agentId === payee && r.periodKey === period,
    );
    if (match) setSlip(match);
  }, [searchParams, rows]);

  function openSlip(row: AgentPeriodRow) {
    setTxRef(row.payout?.txRef ?? "");
    setSlip(row);
    writeSearchParams({
      tab: "agent",
      payee: row.agentId,
      period: row.periodKey,
    });
  }

  function closeSlip() {
    setSlip(null);
    setTxRef("");
    setCopiedKey(null);
    writeSearchParams({ tab, payee: null, period: null });
  }

  async function copySlipValue(key: "address" | "link", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function ensureReadySlip(
    row: AgentPeriodRow,
  ): Promise<CommissionPayoutRecord> {
    const existing =
      payoutByKey.get(`${row.agentId}:${row.periodKey}`) ??
      (await findPayout(row.agentId, row.periodKey, "platform"));
    if (existing) return existing;
    const dest = payoutAddressByAgent.get(row.agentId);
    const link = paymentLinkForPlatformPayout(row.agentId, row.periodKey);
    return upsertCommissionPayout({
      payeeOrgId: row.agentId,
      payeeName: row.agentName,
      payer: "platform",
      payerOrgId: null,
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
      platformFeeCollected: row.platformFeeCollected,
      commissionPercent: row.commissionPercent,
      commissionAmount: row.commissionAmount,
      payoutStatus: "ready",
      payoutAddress: dest?.address ?? null,
      asset: dest?.asset ?? null,
      network: dest?.network ?? null,
      paymentLink: link,
      txRef: null,
      paidAt: null,
    });
  }

  async function onPreparePayout(row: AgentPeriodRow) {
    if (!canPay) return;
    setBusy(true);
    setError(null);
    try {
      await ensureReadySlip(row);
      await refreshPayouts();
      openSlip({ ...row, payoutStatus: "ready" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare payout");
    } finally {
      setBusy(false);
    }
  }

  async function onMarkPaid() {
    if (!slip || !canPay) return;
    setBusy(true);
    setError(null);
    try {
      let record = await ensureReadySlip(slip);
      const dest = payoutAddressByAgent.get(slip.agentId);
      if (dest && !record.payoutAddress) {
        record = await upsertCommissionPayout({
          ...record,
          payoutAddress: dest.address,
          asset: dest.asset,
          network: dest.network,
        });
      }
      await markCommissionPayoutPaid(record.id, txRef);
      await refreshPayouts();
      closeSlip();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark paid");
    } finally {
      setBusy(false);
    }
  }

  const slipDest = slip ? payoutAddressByAgent.get(slip.agentId) : null;
  const slipLink = slip
    ? paymentLinkForPlatformPayout(slip.agentId, slip.periodKey)
    : "";
  const absoluteSlipLink =
    typeof window !== "undefined" && slipLink
      ? `${window.location.origin}${slipLink}`
      : slipLink;

  return (
    <div className="plat-bills plat-commissions">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      {topbarSlot
        ? createPortal(
            <p className="plat-commissions__topbar-title">
              Agent commission payouts
            </p>,
            topbarSlot,
          )
        : null}

      {isViewer ? (
        <p className="banner banner-warn" style={{ marginBottom: 12 }}>
          Viewer — prepare payout and mark paid are hidden.
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

      {tab === "agent" ? (
        <>
          <div className="plat-bills__table-wrap">
            {loading ? (
              <div className="plat-bills__pending">
                <PlatformPending
                  compact
                  title="Loading commission history"
                  copy="Aggregating paid subtree fees for top-level agents."
                />
                <PlatformTableSkeleton columns={7} rows={8} />
              </div>
            ) : null}

            {!loading && rows.length === 0 ? (
              <p className="plat-bills__empty">
                No commission statements yet. They appear after service bills
                exist for merchants under top-level agents.
              </p>
            ) : null}

            {!loading && rows.length > 0 ? (
              <>
                <table className="plat-bills__table plat-commissions__table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Agent</th>
                      <th className="plat-commissions__th-num">
                        Platform fee collected
                      </th>
                      <th className="plat-commissions__th-num">Rate</th>
                      <th className="plat-commissions__th-num">Commission</th>
                      <th>Payout</th>
                      <th className="plat-commissions__th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr
                        key={`${row.agentId}-${row.periodKey}`}
                        className="plat-bills__row"
                      >
                        <td className="plat-commissions__period">
                          {row.periodLabel}
                        </td>
                        <td>
                          <Link
                            className="plat-commissions__agent-link"
                            to={`/platform/agents/${row.agentId}`}
                          >
                            {row.agentName}
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
                            className={`plat-commissions__status is-${payoutTone(row.payoutStatus)}`}
                          >
                            {row.payoutStatus}
                          </span>
                        </td>
                        <td className="plat-commissions__actions-cell">
                          <div className="plat-commissions__row-actions">
                            <button
                              type="button"
                              className="plat-commissions__action"
                              onClick={() => openSlip(row)}
                            >
                              Open slip
                            </button>
                            {canPay && row.payoutStatus !== "paid" ? (
                              <button
                                type="button"
                                className="plat-commissions__action plat-commissions__action--primary"
                                onClick={() => void onPreparePayout(row)}
                              >
                                Prepare payout
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <OrgListPagination
                  page={statementsPage}
                  pageCount={statementsPageCount}
                  total={rows.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setStatementsPage}
                />
              </>
            ) : null}
          </div>

          <h2 className="plat-commissions__history-title">Payment history</h2>
          <p className="plat-bills__hint muted">
            Saved platform → agent payouts (statement + QR/link + tx/ref). Also
            available on each agent’s <strong>Commissions</strong> tab.
          </p>

          {history.length === 0 ? (
            <p className="plat-bills__empty">
              No payouts recorded yet. Use Prepare payout, then Mark paid.
            </p>
          ) : (
            <div className="plat-bills__table-wrap">
              <table className="plat-bills__table plat-commissions__table">
                <thead>
                  <tr>
                    <th>Paid at</th>
                    <th>Period</th>
                    <th>Agent</th>
                    <th className="plat-commissions__th-num">Amount</th>
                    <th>Address</th>
                    <th>Tx / ref</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedHistory.map((h) => (
                    <tr key={h.id} className="plat-bills__row">
                      <td>
                        {h.paidAt
                          ? new Date(h.paidAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="plat-commissions__period">
                        {h.periodLabel}
                      </td>
                      <td>
                        <Link
                          className="plat-commissions__agent-link"
                          to={`/platform/agents/${h.payeeOrgId}`}
                        >
                          {h.payeeName}
                        </Link>
                      </td>
                      <td className="plat-commissions__num plat-commissions__num--emph">
                        <FundAmount amount={h.commissionAmount} />
                      </td>
                      <td className="plat-commissions__addr">
                        {h.payoutAddress ? (
                          <code title={h.payoutAddress}>
                            {h.payoutAddress.slice(0, 10)}…
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{h.txRef || "—"}</td>
                      <td>
                        <span
                          className={`plat-commissions__status is-${payoutTone(h.payoutStatus)}`}
                        >
                          {h.payoutStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <OrgListPagination
                page={historyPage}
                pageCount={historyPageCount}
                total={history.length}
                pageSize={PAGE_SIZE}
                onPageChange={setHistoryPage}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className="plat-commissions__history-title">
            Cascade history (agent → sub)
          </h2>
          <p className="plat-bills__hint muted">
            Read-only view of parent-agent → sub-agent payout slips. Platform
            does not pay sub-agents directly.
          </p>
          {cascadeHistory.length === 0 ? (
            <p className="plat-bills__empty">
              No agent → sub payouts recorded yet.
            </p>
          ) : (
            <div className="plat-bills__table-wrap">
              <table className="plat-bills__table plat-commissions__table">
                <thead>
                  <tr>
                    <th>Paid at</th>
                    <th>Period</th>
                    <th>Sub-agent</th>
                    <th>Payer agent</th>
                    <th className="plat-commissions__th-num">Amount</th>
                    <th>Address</th>
                    <th>Tx / ref</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCascade.map((h) => (
                    <tr key={h.id} className="plat-bills__row">
                      <td>
                        {h.paidAt
                          ? new Date(h.paidAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="plat-commissions__period">
                        {h.periodLabel}
                      </td>
                      <td>
                        <Link
                          className="plat-commissions__agent-link"
                          to={`/platform/agents/${h.payeeOrgId}`}
                        >
                          {h.payeeName}
                        </Link>
                      </td>
                      <td>
                        {h.payerOrgId ? (
                          <Link
                            className="plat-commissions__agent-link"
                            to={`/platform/agents/${h.payerOrgId}`}
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
                      <td className="plat-commissions__addr">
                        {h.payoutAddress ? (
                          <code title={h.payoutAddress}>
                            {h.payoutAddress.slice(0, 10)}…
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{h.txRef || "—"}</td>
                      <td>
                        <span
                          className={`plat-commissions__status is-${payoutTone(h.payoutStatus)}`}
                        >
                          {h.payoutStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <OrgListPagination
                page={cascadePage}
                pageCount={cascadePageCount}
                total={cascadeHistory.length}
                pageSize={PAGE_SIZE}
                onPageChange={setCascadePage}
              />
            </div>
          )}
        </>
      )}

      {slip
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={closeSlip}
            >
              <div
                className="b3-commission-modal plat-commissions-slip"
                role="dialog"
                aria-modal="true"
                aria-labelledby="plat-payout-slip-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head plat-commissions-slip__head">
                  <div className="plat-commissions-slip__head-text">
                    <p className="plat-commissions-slip__kicker">
                      Platform → agent
                    </p>
                    <h3 id="plat-payout-slip-title">
                      Payout slip · {slip.periodLabel}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    onClick={closeSlip}
                  >
                    ×
                  </button>
                </header>
                <div className="b3-commission-modal__body plat-commissions-slip__body">
                  <section className="plat-commissions-slip__summary">
                    <div className="plat-commissions-slip__summary-top">
                      <div>
                        <p className="plat-commissions-slip__label">Payee</p>
                        <p className="plat-commissions-slip__payee">
                          {slip.agentName}
                        </p>
                      </div>
                      <span
                        className={`plat-commissions__status is-${payoutTone(slip.payoutStatus)}`}
                      >
                        {slip.payoutStatus}
                      </span>
                    </div>
                    <p className="plat-commissions-slip__amount">
                      <FundAmount amount={slip.commissionAmount} />
                    </p>
                    <p className="plat-commissions-slip__breakdown">
                      {slip.commissionPercent}% of{" "}
                      <FundAmount amount={slip.platformFeeCollected} /> platform
                      fees collected
                    </p>
                    <p className="plat-commissions-slip__hint">
                      Send funds to the agent payout address below. CryptoGate
                      does not hold or move these funds.
                    </p>
                  </section>

                  {slipDest?.address ? (
                    <section className="plat-commissions-slip__pay">
                      <div className="plat-commissions-slip__qr-wrap">
                        <img
                          src={qrUrl(slipDest.address)}
                          alt="Agent payout address QR"
                          width={148}
                          height={148}
                        />
                        <p className="plat-commissions-slip__asset">
                          {slipDest.asset} · {slipDest.network}
                        </p>
                      </div>
                      <div className="plat-commissions-slip__dest">
                        <div className="plat-commissions-slip__field">
                          <div className="plat-commissions-slip__field-head">
                            <span className="plat-commissions-slip__label">
                              Payout address
                            </span>
                            <button
                              type="button"
                              className="plat-commissions-slip__copy"
                              onClick={() =>
                                void copySlipValue(
                                  "address",
                                  slipDest.address,
                                )
                              }
                            >
                              {copiedKey === "address" ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <code className="plat-commissions-slip__address">
                            {slipDest.address}
                          </code>
                        </div>
                        <div className="plat-commissions-slip__field">
                          <div className="plat-commissions-slip__field-head">
                            <span className="plat-commissions-slip__label">
                              Payment link
                            </span>
                            <button
                              type="button"
                              className="plat-commissions-slip__copy"
                              onClick={() =>
                                void copySlipValue("link", absoluteSlipLink)
                              }
                            >
                              {copiedKey === "link" ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <a
                            className="plat-commissions-slip__link"
                            href={slipLink}
                            title={absoluteSlipLink}
                          >
                            {absoluteSlipLink}
                          </a>
                        </div>
                      </div>
                    </section>
                  ) : (
                    <p className="banner banner-warn">
                      No payout address on this agent yet. Set it on the agent
                      detail page before sending funds.
                    </p>
                  )}

                  {canPay && slip.payoutStatus !== "paid" ? (
                    <label className="plat-commissions-slip__tx">
                      <span className="plat-commissions-slip__label">
                        Tx hash / bank ref
                      </span>
                      <input
                        className="field-control plat-commissions-slip__input"
                        value={txRef}
                        onChange={(e) => setTxRef(e.target.value)}
                        placeholder="Paste proof after sending"
                      />
                    </label>
                  ) : null}

                  {slip.payout?.paidAt ? (
                    <p className="plat-commissions-slip__paid-meta">
                      Recorded{" "}
                      {new Date(slip.payout.paidAt).toLocaleString()}
                      {slip.payout.txRef ? ` · ${slip.payout.txRef}` : ""}
                    </p>
                  ) : null}
                </div>
                <footer className="b3-commission-modal__foot plat-commissions-slip__foot">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={closeSlip}
                  >
                    Close
                  </button>
                  {canPay && slip.payoutStatus !== "paid" ? (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy || !txRef.trim()}
                      onClick={() => void onMarkPaid()}
                    >
                      {busy ? "Saving…" : "Mark paid"}
                    </button>
                  ) : null}
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
