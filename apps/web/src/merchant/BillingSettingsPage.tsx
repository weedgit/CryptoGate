import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  getMerchantCommercial,
  listOrgs,
  type MerchantCommercialSettings,
  type Session,
} from "./api";
import { AuthToast } from "../auth/AuthToast";
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
    <div className="plat-settings plat-settings--merchant">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <div className="plat-settings__grid plat-settings__grid--single">
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Current plan</h2>
            {canPay ? (
              <Link className="btn-primary btn-inline btn-tiny" to="/merchant/service-bills">
                View service bills
              </Link>
            ) : null}
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Platform fee tier and volume rate — display only. Changes come from your
              agent or CryptoGate platform, not from this portal.
            </p>
            <dl className="plat-settings__dl plat-settings__dl--rows">
              <div>
                <dt>Tier</dt>
                <dd>{commercial ? tierLabel(commercial.tier) : "Loading…"}</dd>
              </div>
              <div>
                <dt>Volume fee</dt>
                <dd>
                  {commercial
                    ? `${commercial.volumeFeePercent}% (not deducted from payer on-chain)`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Next period rate</dt>
                <dd>
                  {commercial?.pendingVolumeFeePercent
                    ? `${commercial.pendingVolumeFeePercent}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Subscription</dt>
                <dd>
                  {commercial ? `$${commercial.subscriptionAmountUsd} / month` : "—"}
                </dd>
              </div>
              <div>
                <dt>Agent</dt>
                <dd>{agentName}</dd>
              </div>
            </dl>
            {commercial?.enterpriseApprovalStatus === "pending" ? (
              <p className="plat-settings__notice" role="status">
                Custom Enterprise rate awaits platform Owner review.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
