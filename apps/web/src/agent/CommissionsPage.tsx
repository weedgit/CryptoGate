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
  paymentLinkForAgentSubPayout,
  upsertCommissionPayout,
  type CommissionPayoutRecord,
} from "../commercial/commissionPayoutRecords";
import { FundAmount } from "../platform/FundAmount";
import { OrgListPagination } from "../platform/OrgListPagination";
import { DEFAULT_AGENT_COMMISSION_PERCENT } from "../platform/orgDetailSeeds";
import {
  PlatformPending,
  PlatformTableSkeleton,
} from "../platform/ui/PlatformPending";
import {
  ApiError,
  listAgentCommissions,
  listAgentPayoutAddresses,
  listOrgs,
  listServiceBills,
  type OrgAccount,
  type Session,
} from "./api";
import {
  merchantsInAgentSubtree,
  subAgentsInAgentSubtree,
} from "./agentSubtree";
import {
  primaryAgentOrgId,
  sessionCanOnboardMerchant,
} from "./org";

type Props = { session: Session };

const PAYOUT_LABEL: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  scheduled: "Scheduled",
  ready: "Ready",
};

const PAGE_SIZE = 10;

function payoutTone(status: string): string {
  if (status === "paid") return "paid";
  if (status === "pending") return "pending";
  if (status === "ready") return "ready";
  return "scheduled";
}

function qrUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(data)}`;
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
  const [subPercents, setSubPercents] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [subPayoutAddrs, setSubPayoutAddrs] = useState<
    Map<string, { address: string; asset: string; network: string }>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);
  const [agentPayouts, setAgentPayouts] = useState<CommissionPayoutRecord[]>(
    [],
  );
  const [slip, setSlip] = useState<{
    sub: OrgAccount;
    periodKey: string;
    periodLabel: string;
    amount: number;
    feeBase: number;
    pct: string;
    record: CommissionPayoutRecord | null;
  } | null>(null);
  const [txRef, setTxRef] = useState("");
  const [copiedKey, setCopiedKey] = useState<"address" | "link" | null>(null);
  const [busy, setBusy] = useState(false);
  const [billsCache, setBillsCache] = useState<
    {
      orgId: string;
      periodStart: string;
      volumeFeeAmount: string;
      status: string;
    }[]
  >([]);
  const [statementsPage, setStatementsPage] = useState(1);
  const [subPayoutsPage, setSubPayoutsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const dismissToast = useCallback(() => setError(null), []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("agent-topbar-center"));
    setTopbarActionsSlot(document.getElementById("agent-topbar-actions"));
  }, []);

  const refreshPayouts = useCallback(async () => {
    if (!agentId) {
      setAgentPayouts([]);
      return;
    }
    const rows = await listCommissionPayouts({
      payer: "agent",
      payerOrgId: agentId,
    });
    setAgentPayouts(rows);
  }, [agentId]);

  const load = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      setError("No agent membership on this session");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [orgRows, bills, commissions, payoutAddrs, agentPayoutRows] =
        await Promise.all([
          listOrgs(),
          listServiceBills(),
          listAgentCommissions(),
          listAgentPayoutAddresses(),
          listCommissionPayouts({
            payer: "agent",
            payerOrgId: agentId,
          }),
        ]);
      setOrgs(orgRows);
      setBillsCache(bills);
      const own =
        commissions.find((c) => c.orgId === agentId)?.commissionPercent?.trim() ||
        DEFAULT_AGENT_COMMISSION_PERCENT;
      setPercent(own);
      const merchantIds = new Set(
        merchantsInAgentSubtree(agentId, orgRows).map((m) => m.id),
      );
      setRows(commissionHistoryFromBills(bills, merchantIds, own));

      const pctByOrg = new Map(
        commissions.map((c) => [
          c.orgId,
          c.commissionPercent?.trim() || DEFAULT_AGENT_COMMISSION_PERCENT,
        ]),
      );
      const pctMap = new Map<string, string>();
      const addrMap = new Map<
        string,
        { address: string; asset: string; network: string }
      >();
      for (const s of subAgentsInAgentSubtree(agentId, orgRows)) {
        pctMap.set(
          s.id,
          pctByOrg.get(s.id) ?? DEFAULT_AGENT_COMMISSION_PERCENT,
        );
      }
      for (const payout of payoutAddrs) {
        if (!payout.address) continue;
        addrMap.set(payout.orgId, {
          address: payout.address,
          asset: payout.asset,
          network: payout.network,
        });
      }
      setSubPercents(pctMap);
      setSubPayoutAddrs(addrMap);
      setAgentPayouts(agentPayoutRows);
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
    }
  }, [agentId]);

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
    return subAgentsInAgentSubtree(agentId, orgs);
  }, [agentId, orgs]);

  const mtd = useMemo(() => {
    const key = new Date().toISOString().slice(0, 7);
    return rows.find((r) => r.periodKey === key) ?? rows[0] ?? null;
  }, [rows]);

  const payoutByKey = useMemo(() => {
    const map = new Map<string, CommissionPayoutRecord>();
    for (const p of agentPayouts) {
      map.set(`${p.payeeOrgId}:${p.periodKey}`, p);
    }
    return map;
  }, [agentPayouts]);

  const subPayoutRows = useMemo(() => {
    if (!mtd || !agentId) return [];
    return subs.map((sub) => {
      const pct =
        subPercents.get(sub.id) ?? DEFAULT_AGENT_COMMISSION_PERCENT;
      const merchantIds = new Set(
        merchantsInAgentSubtree(sub.id, orgs).map((m) => m.id),
      );
      const history = commissionHistoryFromBills(billsCache, merchantIds, pct);
      const periodRow =
        history.find((h) => h.periodKey === mtd.periodKey) ?? history[0];
      const saved = payoutByKey.get(`${sub.id}:${mtd.periodKey}`);
      return {
        sub,
        pct,
        periodKey: mtd.periodKey,
        periodLabel: mtd.periodLabel,
        amount: saved?.commissionAmount ?? periodRow?.commissionAmount ?? 0,
        feeBase:
          saved?.platformFeeCollected ?? periodRow?.platformFeeCollected ?? 0,
        record: saved ?? null,
        status: (saved?.payoutStatus ??
          periodRow?.payoutStatus ??
          "scheduled") as string,
      };
    });
  }, [subs, mtd, agentId, orgs, subPercents, billsCache, payoutByKey]);

  const agentPaidHistory = agentPayouts;

  const statementsPageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (statementsPage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, statementsPage]);

  const subPayoutsPageCount = Math.max(
    1,
    Math.ceil(subPayoutRows.length / PAGE_SIZE),
  );
  const pagedSubPayouts = useMemo(() => {
    const start = (subPayoutsPage - 1) * PAGE_SIZE;
    return subPayoutRows.slice(start, start + PAGE_SIZE);
  }, [subPayoutRows, subPayoutsPage]);

  const historyPageCount = Math.max(
    1,
    Math.ceil(agentPaidHistory.length / PAGE_SIZE),
  );
  const pagedHistory = useMemo(() => {
    const start = (historyPage - 1) * PAGE_SIZE;
    return agentPaidHistory.slice(start, start + PAGE_SIZE);
  }, [agentPaidHistory, historyPage]);

  useEffect(() => {
    setStatementsPage(1);
  }, [rows.length]);

  useEffect(() => {
    setSubPayoutsPage(1);
  }, [subPayoutRows.length]);

  useEffect(() => {
    setHistoryPage(1);
  }, [agentPaidHistory.length]);

  useEffect(() => {
    if (statementsPage > statementsPageCount) {
      setStatementsPage(statementsPageCount);
    }
  }, [statementsPage, statementsPageCount]);

  useEffect(() => {
    if (subPayoutsPage > subPayoutsPageCount) {
      setSubPayoutsPage(subPayoutsPageCount);
    }
  }, [subPayoutsPage, subPayoutsPageCount]);

  useEffect(() => {
    if (historyPage > historyPageCount) setHistoryPage(historyPageCount);
  }, [historyPage, historyPageCount]);

  useEffect(() => {
    const payee = searchParams.get("payee");
    const period = searchParams.get("period");
    if (!payee || !period || !mtd) return;
    const match = subPayoutRows.find(
      (r) => r.sub.id === payee && r.periodKey === period,
    );
    if (match) {
      setSlip({
        sub: match.sub,
        periodKey: match.periodKey,
        periodLabel: match.periodLabel,
        amount: match.amount,
        feeBase: match.feeBase,
        pct: match.pct,
        record: match.record,
      });
      setTxRef(match.record?.txRef ?? "");
    }
  }, [searchParams, subPayoutRows, mtd]);

  async function openSubSlip(row: (typeof subPayoutRows)[number]) {
    const link = paymentLinkForAgentSubPayout(row.sub.id, row.periodKey);
    const dest = subPayoutAddrs.get(row.sub.id);
    setBusy(true);
    setError(null);
    try {
      let record =
        payoutByKey.get(`${row.sub.id}:${row.periodKey}`) ??
        (await findPayout(row.sub.id, row.periodKey, "agent"));
      if (!record && canManage && agentId) {
        record = await upsertCommissionPayout({
          payeeOrgId: row.sub.id,
          payeeName: row.sub.name,
          payer: "agent",
          payerOrgId: agentId,
          periodKey: row.periodKey,
          periodLabel: row.periodLabel,
          platformFeeCollected: row.feeBase,
          commissionPercent: row.pct,
          commissionAmount: row.amount,
          payoutStatus: "ready",
          payoutAddress: dest?.address ?? null,
          asset: dest?.asset ?? null,
          network: dest?.network ?? null,
          paymentLink: link,
          txRef: null,
          paidAt: null,
        });
      } else if (record && dest && !record.payoutAddress && canManage) {
        record = await upsertCommissionPayout({
          ...record,
          payoutAddress: dest.address,
          asset: dest.asset,
          network: dest.network,
        });
      }
      if (record) await refreshPayouts();
      setSlip({
        sub: row.sub,
        periodKey: row.periodKey,
        periodLabel: row.periodLabel,
        amount: row.amount,
        feeBase: row.feeBase,
        pct: row.pct,
        record: record ?? null,
      });
      setTxRef(record?.txRef ?? "");
      setSearchParams(
        { payee: row.sub.id, period: row.periodKey },
        { replace: true },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open payout slip");
    } finally {
      setBusy(false);
    }
  }

  function closeSlip() {
    setSlip(null);
    setTxRef("");
    setCopiedKey(null);
    setSearchParams({}, { replace: true });
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

  async function onMarkSubPaid() {
    if (!slip?.record || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      let record = slip.record;
      const dest = subPayoutAddrs.get(slip.sub.id);
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

  const slipDest = slip ? subPayoutAddrs.get(slip.sub.id) : null;
  const slipLink = slip
    ? paymentLinkForAgentSubPayout(slip.sub.id, slip.periodKey)
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
        <div>
          <p className="plat-commissions__eyebrow">Rebate rate</p>
          <p className="plat-commissions__rate">{percent}%</p>
          <p className="plat-bills__hint muted" style={{ margin: "6px 0 0" }}>
            {isTopLevel
              ? "Platform pays your org from collected fees (Option A). You pay sub-agents."
              : "Parent agent pays this sub-agent. Platform does not pay sub-agents directly."}{" "}
            Watch-only — never skimmed from payer on-chain payments. Fee base =
            paid service-bill volume fees.
          </p>
        </div>
        {mtd ? (
          <div className="plat-commissions__mtd">
            <p className="plat-commissions__eyebrow">
              {mtd.periodLabel} statement
            </p>
            <p className="plat-commissions__mtd-value">
              <FundAmount amount={mtd.commissionAmount} />
            </p>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
              Base <FundAmount amount={mtd.platformFeeCollected} /> ·{" "}
              {PAYOUT_LABEL[mtd.payoutStatus] ?? mtd.payoutStatus}
            </p>
          </div>
        ) : null}
      </div>

      <p className="plat-bills__hint muted">
        Statements from merchant service bills in your subtree.{" "}
        <Link to="/agent/service-bills">View service bills</Link>
      </p>

      <div className="plat-bills__table-wrap">
        {loading ? (
          <div className="plat-bills__pending">
            <PlatformPending
              compact
              title="Loading commissions"
              copy="Aggregating subtree service bills into monthly statements."
            />
            <PlatformTableSkeleton columns={5} rows={6} />
          </div>
        ) : null}

        {!loading && rows.length === 0 ? (
          <p className="plat-bills__empty">
            No statements yet. They appear after platform service bills exist for
            merchants in this subtree.
          </p>
        ) : null}

        {!loading && rows.length > 0 ? (
          <>
          <table className="plat-bills__table plat-commissions__table">
            <thead>
              <tr>
                <th>Period</th>
                <th className="plat-commissions__th-num">Platform fee collected</th>
                <th className="plat-commissions__th-num">Rate</th>
                <th className="plat-commissions__th-num">Commission</th>
                <th>Payout</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, index) => (
                <tr
                  key={row.id}
                  className="plat-bills__row"
                  style={{
                    animationDelay: `${Math.min(index, 24) * 40}ms`,
                  }}
                >
                  <td className="plat-commissions__period">{row.periodLabel}</td>
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
                      {PAYOUT_LABEL[row.payoutStatus] ?? row.payoutStatus}
                    </span>
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

      {isTopLevel && !loading ? (
        <>
          <h2 className="plat-commissions__history-title">
            Sub-agent payouts
          </h2>
          <p className="plat-bills__hint muted">
            You pay sub-agents with a payout slip (QR + payment link). History is
            saved when you mark paid. Platform can view cascade history on their
            side separately.
          </p>
          {subs.length === 0 ? (
            <p className="plat-bills__empty">
              No sub-agents yet.{" "}
              <Link to="/agent/agents/new">Onboard a sub-agent</Link>
            </p>
          ) : !mtd ? (
            <p className="plat-bills__empty">
              Sub-agent payouts appear once you have a statement period.
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
                    <th className="plat-commissions__th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSubPayouts.map((row) => (
                    <tr key={row.sub.id} className="plat-bills__row">
                      <td>
                        <Link
                          className="plat-commissions__agent-link"
                          to={`/agent/agents/${row.sub.id}`}
                        >
                          {row.sub.name}
                        </Link>
                      </td>
                      <td className="plat-commissions__period">
                        {row.periodLabel}
                      </td>
                      <td className="plat-commissions__num">
                        <FundAmount amount={row.feeBase} />
                      </td>
                      <td className="plat-commissions__rate-cell">{row.pct}%</td>
                      <td className="plat-commissions__num plat-commissions__num--emph">
                        <FundAmount amount={row.amount} />
                      </td>
                      <td>
                        <span
                          className={`plat-commissions__status is-${payoutTone(row.status)}`}
                        >
                          {PAYOUT_LABEL[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="plat-commissions__actions-cell">
                        {canManage ? (
                          <div className="plat-commissions__row-actions">
                            <button
                              type="button"
                              className="plat-commissions__action plat-commissions__action--primary"
                              onClick={() => void openSubSlip(row)}
                            >
                              {row.status === "paid"
                                ? "View slip"
                                : "Payout slip"}
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <OrgListPagination
                page={subPayoutsPage}
                pageCount={subPayoutsPageCount}
                total={subPayoutRows.length}
                pageSize={PAGE_SIZE}
                onPageChange={setSubPayoutsPage}
              />
            </div>
          )}

          {agentPaidHistory.length > 0 ? (
            <>
              <h2 className="plat-commissions__history-title">
                Sub-agent payment history
              </h2>
              <div className="plat-bills__table-wrap">
                <table className="plat-bills__table plat-commissions__table">
                  <thead>
                    <tr>
                      <th>Paid at</th>
                      <th>Sub-agent</th>
                      <th>Period</th>
                      <th className="plat-commissions__th-num">Amount</th>
                      <th>Tx / ref</th>
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
                        <td>{h.payeeName}</td>
                        <td className="plat-commissions__period">
                          {h.periodLabel}
                        </td>
                        <td className="plat-commissions__num plat-commissions__num--emph">
                          <FundAmount amount={h.commissionAmount} />
                        </td>
                        <td>{h.txRef || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <OrgListPagination
                  page={historyPage}
                  pageCount={historyPageCount}
                  total={agentPaidHistory.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setHistoryPage}
                />
              </div>
            </>
          ) : null}
        </>
      ) : null}

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
                aria-labelledby="agent-sub-slip-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head plat-commissions-slip__head">
                  <div className="plat-commissions-slip__head-text">
                    <p className="plat-commissions-slip__kicker">
                      Agent → sub-agent
                    </p>
                    <h3 id="agent-sub-slip-title">
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
                          {slip.sub.name}
                        </p>
                      </div>
                      <span
                        className={`plat-commissions__status is-${payoutTone(slip.record?.payoutStatus ?? "ready")}`}
                      >
                        {PAYOUT_LABEL[slip.record?.payoutStatus ?? "ready"] ??
                          slip.record?.payoutStatus ??
                          "Ready"}
                      </span>
                    </div>
                    <p className="plat-commissions-slip__amount">
                      <FundAmount amount={slip.amount} />
                    </p>
                    <p className="plat-commissions-slip__breakdown">
                      {slip.pct}% on <FundAmount amount={slip.feeBase} /> fee
                      base
                    </p>
                    <p className="plat-commissions-slip__hint">
                      Send funds to the sub-agent payout address below. Platform
                      does not pay sub-agents directly.
                    </p>
                  </section>

                  {slipDest?.address ? (
                    <section className="plat-commissions-slip__pay">
                      <div className="plat-commissions-slip__qr-wrap">
                        <img
                          src={qrUrl(slipDest.address)}
                          alt="Sub-agent payout address QR"
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
                      No payout address on this sub-agent yet. They must set it
                      under their agent Settings (commission payout address),
                      then reopen this slip.
                    </p>
                  )}

                  {canManage && slip.record?.payoutStatus !== "paid" ? (
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
                </div>
                <footer className="b3-commission-modal__foot plat-commissions-slip__foot">
                  <button type="button" className="btn-ghost" onClick={closeSlip}>
                    Close
                  </button>
                  {canManage && slip.record?.payoutStatus !== "paid" ? (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy || !txRef.trim()}
                      onClick={() => void onMarkSubPaid()}
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
