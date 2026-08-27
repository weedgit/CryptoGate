import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { commissionHistoryFromBills } from "../commercial/commissionStatements";
import { DEFAULT_AGENT_COMMISSION_PERCENT } from "../platform/orgDetailSeeds";
import {
  ApiError,
  getAgentCommission,
  listOrgs,
  listServiceBills,
  type Session,
} from "./api";
import { merchantsInAgentSubtree } from "./agentSubtree";
import { formatUsd, primaryAgentOrgId } from "./org";

type Props = { session: Session };

const PAYOUT_LABEL: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  scheduled: "Scheduled",
};

export function CommissionsPage({ session }: Props) {
  const agentId = primaryAgentOrgId(session);
  const [rows, setRows] = useState<
    ReturnType<typeof commissionHistoryFromBills>
  >([]);
  const [percent, setPercent] = useState(DEFAULT_AGENT_COMMISSION_PERCENT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      setError("No agent membership on this session");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [orgs, bills, commission] = await Promise.all([
        listOrgs(),
        listServiceBills(),
        getAgentCommission(agentId).catch(() => null),
      ]);
      const pct =
        commission?.commissionPercent?.trim() ||
        DEFAULT_AGENT_COMMISSION_PERCENT;
      setPercent(pct);
      const merchantIds = new Set(
        merchantsInAgentSubtree(agentId, orgs).map((m) => m.id),
      );
      setRows(commissionHistoryFromBills(bills, merchantIds, pct));
    } catch (err) {
      setError(
        err instanceof ApiError
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

  const mtd = useMemo(() => {
    const key = new Date().toISOString().slice(0, 7);
    return rows.find((r) => r.periodKey === key) ?? rows[0] ?? null;
  }, [rows]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Commission statements</h2>
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Read-only rebate from <strong>platform fee</strong> on merchant service
        bills in your subtree — not a share of payer on-chain payments. Payout
        is scheduled by the platform.
      </p>
      {mtd ? (
        <p>
          Latest: {mtd.periodLabel} · {formatUsd(String(mtd.commissionAmount))}{" "}
          at {percent}%
        </p>
      ) : null}
      {loading ? <p style={{ color: "var(--muted)" }}>Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          No statements yet. They appear after platform service bills exist for
          merchants in this subtree.{" "}
          <Link to="/agent/service-bills">View service bills</Link>
        </p>
      ) : null}
      {!loading && rows.length > 0 ? (
        <table className="data-table">
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
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.periodLabel}</td>
                <td>{formatUsd(String(row.platformFeeCollected))}</td>
                <td>{row.commissionPercent}%</td>
                <td>{formatUsd(String(row.commissionAmount))}</td>
                <td>{PAYOUT_LABEL[row.payoutStatus] ?? row.payoutStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
