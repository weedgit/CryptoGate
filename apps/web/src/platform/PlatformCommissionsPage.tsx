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
  getAgentCommission,
  getAgentPayout,
  getPlatformOrgs,
  getPlatformServiceBills,
  type OrgAccount,
  type ServiceBill,
  type Session,
} from "./api";
import { FundAmount } from "./FundAmount";
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

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

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

  const dismissToast = useCallback(() => setError(null), []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
  }, []);

  const refreshPayouts = useCallback(async () => {
    const [platformRows, agentRows] = await Promise.all([
      listCommissionPayouts({ payer: "platform" }),
      listCommissionPayouts({ payer: "agent" }),
    ]);
    setPlatformPayouts(platformRows);
    setCascadePayouts(agentRows);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRows, billRows] = await Promise.all([
        getPlatformOrgs(),
        getPlatformServiceBills(),
      ]);
      setOrgs(orgRows);
      setBills(billRows);

      const byId = new Map(orgRows.map((o) => [o.id, o]));
      const tops = orgRows.filter((o) => isTopLevelAgent(o, byId));
      const pctMap = new Map<string, string>();
      const addrMap = new Map<
        string,
        { address: string; asset: string; network: string }
      >();
      await Promise.all(
        tops.map(async (agent) => {
          const [commission, payout] = await Promise.all([
            getAgentCommission(agent.id).catch(() => null),
            getAgentPayout(agent.id).catch(() => null),
          ]);
          pctMap.set(
            agent.id,
            commission?.commissionPercent?.trim() ||
              DEFAULT_AGENT_COMMISSION_PERCENT,
          );
          if (payout?.address) {
            addrMap.set(agent.id, {
              address: payout.address,
              asset: payout.asset,
              network: payout.network,
            });
          }
        }),
      );
      setPercentByAgent(pctMap);
      setPayoutAddressByAgent(addrMap);
      await refreshPayouts();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load commission history",
      );
    } finally {
      setLoading(false);
    }
  }, [refreshPayouts]);

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

  useEffect(() => {
    const payee = searchParams.get("payee");
    const period = searchParams.get("period");
    if (!payee || !period || rows.length === 0) return;
    const match = rows.find(
      (r) => r.agentId === payee && r.periodKey === period,
    );
    if (match) setSlip(match);
  }, [searchParams, rows]);

  function openSlip(row: AgentPeriodRow) {
    setTxRef(row.payout?.txRef ?? "");
    setSlip(row);
    setSearchParams(
      { payee: row.agentId, period: row.periodKey },
      { replace: true },
    );
  }

  function closeSlip() {
    setSlip(null);
    setTxRef("");
    setSearchParams({}, { replace: true });
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

      <p className="plat-bills__hint muted">
        Platform pays <strong>top-level agents only</strong> (Decision 1b). When
        a statement is ready, prepare a payout slip (QR + payment link to the
        agent’s payout address), send funds, then mark paid. Agents settle their
        own sub-agents. Fee base uses <strong>paid</strong> service-bill volume
        fees only (watch-only — never skimmed from payer txs). History is kept
        below.
      </p>

      {isViewer ? (
        <p className="banner banner-warn" style={{ marginBottom: 12 }}>
          Viewer — prepare payout and mark paid are hidden.
        </p>
      ) : null}

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
            No commission statements yet. They appear after service bills exist
            for merchants under top-level agents.
          </p>
        ) : null}

        {!loading && rows.length > 0 ? (
          <table className="plat-bills__table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Agent</th>
                <th>Platform fee collected</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Payout</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.agentId}-${row.periodKey}`}
                  className="plat-bills__row"
                  style={{
                    animationDelay: `${Math.min(index, 24) * 40}ms`,
                  }}
                >
                  <td>{row.periodLabel}</td>
                  <td>
                    <Link to={`/platform/agents/${row.agentId}`}>
                      {row.agentName}
                    </Link>
                  </td>
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
                        row.payoutStatus === "paid"
                          ? "paid"
                          : row.payoutStatus === "pending"
                            ? "issued"
                            : "issued"
                      }`}
                    >
                      {row.payoutStatus}
                    </span>
                  </td>
                  <td>
                    <div className="plat-commissions__row-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-inline"
                        onClick={() => openSlip(row)}
                      >
                        Open slip
                      </button>
                      {canPay && row.payoutStatus !== "paid" ? (
                        <button
                          type="button"
                          className="btn-secondary btn-inline"
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
        ) : null}
      </div>

      <h2 className="plat-commissions__history-title">Payment history</h2>
      <p className="plat-bills__hint muted">
        Saved platform → agent payouts (statement + QR/link + tx/ref). Also
        available on each agent’s{" "}
        <strong>Commissions</strong> tab.
      </p>

      {history.length === 0 ? (
        <p className="plat-bills__empty">
          No payouts recorded yet. Use Prepare payout, then Mark paid.
        </p>
      ) : (
        <div className="plat-bills__table-wrap">
          <table className="plat-bills__table">
            <thead>
              <tr>
                <th>Paid at</th>
                <th>Period</th>
                <th>Agent</th>
                <th>Amount</th>
                <th>Address</th>
                <th>Tx / ref</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="plat-bills__row">
                  <td>
                    {h.paidAt
                      ? new Date(h.paidAt).toLocaleString()
                      : "—"}
                  </td>
                  <td>{h.periodLabel}</td>
                  <td>
                    <Link to={`/platform/agents/${h.payeeOrgId}`}>
                      {h.payeeName}
                    </Link>
                  </td>
                  <td className="plat-bills__amount">
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
                      className={`org-agents__bill is-${
                        h.payoutStatus === "paid" ? "paid" : "issued"
                      }`}
                    >
                      {h.payoutStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="plat-commissions__history-title">
        Cascade history (agent → sub)
      </h2>
      <p className="plat-bills__hint muted">
        Read-only view of parent-agent → sub-agent payout slips. Platform does
        not pay sub-agents directly.
      </p>
      {cascadeHistory.length === 0 ? (
        <p className="plat-bills__empty">
          No agent → sub payouts recorded yet.
        </p>
      ) : (
        <div className="plat-bills__table-wrap">
          <table className="plat-bills__table">
            <thead>
              <tr>
                <th>Paid at</th>
                <th>Period</th>
                <th>Sub-agent</th>
                <th>Payer agent</th>
                <th>Amount</th>
                <th>Address</th>
                <th>Tx / ref</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cascadeHistory.map((h) => (
                <tr key={h.id} className="plat-bills__row">
                  <td>
                    {h.paidAt
                      ? new Date(h.paidAt).toLocaleString()
                      : "—"}
                  </td>
                  <td>{h.periodLabel}</td>
                  <td>
                    <Link to={`/platform/agents/${h.payeeOrgId}`}>
                      {h.payeeName}
                    </Link>
                  </td>
                  <td>
                    {h.payerOrgId ? (
                      <Link to={`/platform/agents/${h.payerOrgId}`}>
                        {byId.get(h.payerOrgId)?.name ?? h.payerOrgId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="plat-bills__amount">
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
                      className={`org-agents__bill is-${
                        h.payoutStatus === "paid" ? "paid" : "issued"
                      }`}
                    >
                      {h.payoutStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                <header className="b3-commission-modal__head">
                  <h3 id="plat-payout-slip-title">
                    Payout slip · {slip.periodLabel}
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
                    Pay <strong>{slip.agentName}</strong>{" "}
                    <FundAmount amount={slip.commissionAmount} /> (
                    {slip.commissionPercent}% of{" "}
                    <FundAmount amount={slip.platformFeeCollected} /> collected
                    fees). QR and link point to the <strong>agent payout
                    address</strong> — platform sends funds here.
                  </p>

                  {slipDest?.address ? (
                    <div className="plat-commissions-slip__qr">
                      <img
                        src={qrUrl(slipDest.address)}
                        alt="Agent payout address QR"
                        width={180}
                        height={180}
                      />
                      <div>
                        <p className="plat-commissions__eyebrow">
                          {slipDest.asset} · {slipDest.network}
                        </p>
                        <code className="plat-commissions-slip__address">
                          {slipDest.address}
                        </code>
                        <p className="plat-commissions__eyebrow" style={{ marginTop: 12 }}>
                          Payment link
                        </p>
                        <a href={slipLink}>{absoluteSlipLink}</a>
                      </div>
                    </div>
                  ) : (
                    <p className="banner banner-warn">
                      No payout address on this agent yet. Set it on the agent
                      detail page before sending funds.
                    </p>
                  )}

                  {canPay && slip.payoutStatus !== "paid" ? (
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

                  {slip.payout?.paidAt ? (
                    <p className="muted">
                      Paid {new Date(slip.payout.paidAt).toLocaleString()}
                      {slip.payout.txRef ? ` · ${slip.payout.txRef}` : ""}
                    </p>
                  ) : null}
                </div>
                <footer className="b3-commission-modal__foot">
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
