import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  getMerchantCommercial,
  listOrgs,
  type MerchantCommercialSettings,
  type Session,
} from "./api";
import { tierLabel } from "../commercialLabels";
import { primaryMerchantOrgId, sessionCanCheckoutServiceBill } from "./org";

type Props = { session: Session };

export function BillingSettingsPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canPay = sessionCanCheckoutServiceBill(session);
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(null);
  const [agentName, setAgentName] = useState<string>("—");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const [row, orgs] = await Promise.all([
          getMerchantCommercial(orgId),
          listOrgs(),
        ]);
        if (cancelled) return;
        setCommercial(row);
        const self = orgs.find((o) => o.id === orgId);
        if (self?.parentId) {
          const agent = orgs.find((o) => o.id === self.parentId);
          setAgentName(agent?.name ?? self.parentId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load billing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return (
    <div className="settings-page">
      <div className="settings-header">
        <p className="muted" style={{ margin: 0 }}>
          Platform fee tier and volume rate — display only. Changes come from your agent
          or CryptoGate platform, not from this portal.
        </p>
        {canPay ? (
          <Link className="btn-primary btn-inline" to="/merchant/service-bills">
            View service bills
          </Link>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="panel settings-panel">
        <h2>Current plan</h2>
        <div className="settings-field">
          <span className="settings-label">Tier</span>
          <span>{commercial ? tierLabel(commercial.tier) : "Loading…"}</span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Volume fee</span>
          <span>
            {commercial
              ? `${commercial.volumeFeePercent}% (not deducted from payer on-chain)`
              : "—"}
          </span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Next period rate</span>
          <span>
            {commercial?.pendingVolumeFeePercent
              ? `${commercial.pendingVolumeFeePercent}%`
              : "—"}
          </span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Subscription</span>
          <span>
            {commercial ? `$${commercial.subscriptionAmountUsd} / month` : "—"}
          </span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Agent</span>
          <span>{agentName}</span>
        </div>
        {commercial?.enterpriseApprovalStatus === "pending" ? (
          <div className="alert-card tone-anomaly" style={{ marginTop: 16 }}>
            <strong>PENDING APPROVAL</strong>
            <p>Custom Enterprise rate awaits platform Owner review.</p>
          </div>
        ) : null}
      </div>

      <div className="alert-card tone-teal">
        <strong>SERVICE BILLS</strong>
        <p>
          Customer crypto payments go to your wallet. Service bills pay for CryptoGate
          software separately — see{" "}
          <Link to="/merchant/service-bills">Service Bills</Link>.
        </p>
      </div>
    </div>
  );
}
