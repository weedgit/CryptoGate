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
import { DEFAULT_AGENT_COMMISSION_PERCENT } from "../platform/orgDetailSeeds";
import {
  PlatformPending,
  PlatformTableSkeleton,
} from "../platform/ui/PlatformPending";
import {
  ApiError,
  getAgentCommission,
  getAgentPayout,
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
  const [busy, setBusy] = useState(false);
  const [billsCache, setBillsCache] = useState<
    {
      orgId: string;
      periodStart: string;
      volumeFeeAmount: string;
      status: string;
    }[]
  >([]);

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
      const [orgRows, bills, commission] = await Promise.all([
        listOrgs(),
        listServiceBills(),
        getAgentCommission(agentId).catch(() => null),
      ]);
      setOrgs(orgRows);
      setBillsCache(bills);
      const pct =
        commission?.commissionPercent?.trim() ||
        DEFAULT_AGENT_COMMISSION_PERCENT;
      setPercent(pct);
      const merchantIds = new Set(
        merchantsInAgentSubtree(agentId, orgRows).map((m) => m.id),
      );
      setRows(commissionHistoryFromBills(bills, merchantIds, pct));

      const subs = subAgentsInAgentSubtree(agentId, orgRows);
      const pctMap = new Map<string, string>();
      const addrMap = new Map<
        string,
        { address: string; asset: string; network: string }
      >();
      await Promise.all(
        subs.map(async (s) => {
          const [c, payout] = await Promise.all([
            getAgentCommission(s.id).catch(() => null),
            getAgentPayout(s.id).catch(() => null),
          ]);
          pctMap.set(
            s.id,
            c?.commissionPercent?.trim() || DEFAULT_AGENT_COMMISSION_PERCENT,
          );
          if (payout?.address) {
            addrMap.set(s.id, {
              address: payout.address,
              asset: payout.asset,
              network: payout.network,
            });
          }
        }),
      );
      setSubPercents(pctMap);
      setSubPayoutAddrs(addrMap);
      await refreshPayouts();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load commission statements",
      );
    } finally {
      setLoading(false);
    }
  }, [agentId, refreshPayouts]);

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
    setSearchParams({}, { replace: true });
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
          <table className="plat-bills__table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Platform fee collected</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Payout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className="plat-bills__row"
                  style={{
                    animationDelay: `${Math.min(index, 24) * 40}ms`,
                  }}
                >
                  <td>{row.periodLabel}</td>
                  <td className="plat-bills__amount">
                    <FundAmount amount={row.platformFeeCollected} />
                  </td>
                  <td>{row.commissionPercent}%</td>
                  <td className="plat-bills__amount">
                    <FundAmount amount={row.commissionAmount} />
                  </td>
                  <td>
                    <span
                      className={`org-agents__bill is-${
                        row.payoutStatus === "paid" ? "paid" : "issued"
                      }`}
                    >
                      {PAYOUT_LABEL[row.payoutStatus] ?? row.payoutStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <table className="plat-bills__table">
                <thead>
                  <tr>
                    <th>Sub-agent</th>
                    <th>Period</th>
                    <th>Fee base</th>
                    <th>Rate</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {subPayoutRows.map((row) => (
                    <tr key={row.sub.id} className="plat-bills__row">
                      <td>
                        <Link to={`/agent/agents/${row.sub.id}`}>
                          {row.sub.name}
                        </Link>
                      </td>
                      <td>{row.periodLabel}</td>
                      <td className="plat-bills__amount">
                        <FundAmount amount={row.feeBase} />
                      </td>
                      <td>{row.pct}%</td>
                      <td className="plat-bills__amount">
                        <FundAmount amount={row.amount} />
                      </td>
                      <td>
                        <span
                          className={`org-agents__bill is-${
                            row.status === "paid" ? "paid" : "issued"
                          }`}
                        >
                          {PAYOUT_LABEL[row.status] ?? row.status}
                        </span>
                      </td>
                      <td>
                        {canManage ? (
                          <button
                            type="button"
                            className="btn-secondary btn-inline"
                            onClick={() => void openSubSlip(row)}
                          >
                            {row.status === "paid"
                              ? "View slip"
                              : "Payout slip"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {agentPaidHistory.length > 0 ? (
            <>
              <h2 className="plat-commissions__history-title">
                Sub-agent payment history
              </h2>
              <div className="plat-bills__table-wrap">
                <table className="plat-bills__table">
                  <thead>
                    <tr>
                      <th>Paid at</th>
                      <th>Sub-agent</th>
                      <th>Period</th>
                      <th>Amount</th>
                      <th>Tx / ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentPaidHistory.map((h) => (
                      <tr key={h.id} className="plat-bills__row">
                        <td>
                          {h.paidAt
                            ? new Date(h.paidAt).toLocaleString()
                            : "—"}
                        </td>
                        <td>{h.payeeName}</td>
                        <td>{h.periodLabel}</td>
                        <td className="plat-bills__amount">
                          <FundAmount amount={h.commissionAmount} />
                        </td>
                        <td>{h.txRef || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <header className="b3-commission-modal__head">
                  <h3 id="agent-sub-slip-title">
                    Sub-agent payout · {slip.periodLabel}
                  </h3>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    onClick={closeSlip}
                  >
                    ×
                  </button>
                </header>
                <div className="b3-commission-modal__body">
                  <p className="muted" style={{ marginTop: 0 }}>
                    Pay <strong>{slip.sub.name}</strong>{" "}
                    <FundAmount amount={slip.amount} /> ({slip.pct}% on{" "}
                    <FundAmount amount={slip.feeBase} /> fee base). QR and link
                    point to the <strong>sub-agent payout address</strong>.
                  </p>
                  {slipDest?.address ? (
                    <div className="plat-commissions-slip__qr">
                      <img
                        src={qrUrl(slipDest.address)}
                        alt="Sub-agent payout address QR"
                        width={160}
                        height={160}
                      />
                      <div>
                        <p className="plat-commissions__eyebrow">
                          {slipDest.asset} · {slipDest.network}
                        </p>
                        <code className="plat-commissions-slip__address">
                          {slipDest.address}
                        </code>
                        <p
                          className="plat-commissions__eyebrow"
                          style={{ marginTop: 12 }}
                        >
                          Payment link
                        </p>
                        <a href={slipLink}>{absoluteSlipLink}</a>
                      </div>
                    </div>
                  ) : (
                    <p className="banner banner-warn">
                      No payout address on this sub-agent yet. They must set it
                      under their agent Settings (commission payout address),
                      then reopen this slip.
                    </p>
                  )}
                  {canManage && slip.record?.payoutStatus !== "paid" ? (
                    <label className="plat-commissions-slip__tx">
                      <span>Tx hash / bank ref</span>
                      <input
                        className="field-control"
                        value={txRef}
                        onChange={(e) => setTxRef(e.target.value)}
                        placeholder="Paste proof after sending"
                      />
                    </label>
                  ) : null}
                </div>
                <footer className="b3-commission-modal__foot">
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
