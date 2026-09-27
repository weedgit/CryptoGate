import { useEffect, useMemo, useState } from "react";
import { tierLabel } from "../commercialLabels";
import { sessionNeedsActivationPayment } from "../auth/contactVerification";
import {
  getMerchantCommercial,
  getOrg,
  type MerchantCommercialSettings,
  type Session,
} from "./api";
import { primaryMerchantOrgId } from "./org";

type Props = { session: Session };

/** Fee tier, volume rate, and billing schedule above the merchant service bill list. */
export function MerchantBillingPlanCard({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const needsActivationPay = useMemo(
    () => sessionNeedsActivationPayment(session),
    [session],
  );
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(
    null,
  );
  const [agentName, setAgentName] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await getMerchantCommercial(orgId);
        if (cancelled) return;
        setCommercial(row);
        const account = await getOrg(orgId);
        if (cancelled) return;
        if (account.parentId) {
          try {
            const parent = await getOrg(account.parentId);
            if (!cancelled) setAgentName(parent.name?.trim() || null);
          } catch {
            if (!cancelled) setAgentName(null);
          }
        } else {
          setAgentName(null);
        }
      } catch {
        if (!cancelled) {
          setCommercial(null);
          setAgentName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return (
    <section className="plat-bills__plan" aria-label="Fee and billing">
      <div className="plat-bills__plan-head">
        <div>
          <h2 className="plat-bills__plan-title">Fee &amp; billing</h2>
          <p className="plat-bills__plan-copy">
            Platform fee tier and volume rate — display only. Changes come from
            your agent or PaymentGate platform.
          </p>
        </div>
      </div>
      <div className="plat-bills__plan-stats">
        <article className="plat-bills__plan-stat">
          <span className="plat-bills__plan-label">Tier</span>
          <strong className="plat-bills__plan-value">
            {commercial ? tierLabel(commercial.tier) : "—"}
          </strong>
        </article>
        <article className="plat-bills__plan-stat">
          <span className="plat-bills__plan-label">Volume fee</span>
          <strong className="plat-bills__plan-value">
            {commercial ? `${commercial.volumeFeePercent}%` : "—"}
          </strong>
          <span className="plat-bills__plan-hint">
            Not deducted from payer on-chain
          </span>
        </article>
        <article className="plat-bills__plan-stat">
          <span className="plat-bills__plan-label">Subscription</span>
          <strong className="plat-bills__plan-value">
            {commercial ? `$${commercial.subscriptionAmountUsd}` : "—"}
          </strong>
          <span className="plat-bills__plan-hint">per month</span>
        </article>
        <article className="plat-bills__plan-stat">
          <span className="plat-bills__plan-label">Next period rate</span>
          <strong className="plat-bills__plan-value">
            {commercial?.pendingVolumeFeePercent
              ? `${commercial.pendingVolumeFeePercent}%`
              : "—"}
          </strong>
          {agentName ? (
            <span className="plat-bills__plan-hint">Agent · {agentName}</span>
          ) : null}
        </article>
      </div>
      {commercial?.nextInvoiceOn ? (
        <p className="plat-bills__plan-hint" style={{ marginTop: "0.75rem" }}>
          Next subscription invoice on <strong>{commercial.nextInvoiceOn}</strong>
          {commercial.billingAnchorAt
            ? ` · billing anchor ${String(commercial.billingAnchorAt).slice(0, 10)}`
            : ""}
        </p>
      ) : needsActivationPay ? (
        <p className="plat-bills__plan-hint" style={{ marginTop: "0.75rem" }}>
          Billing schedule starts after activation is paid.
        </p>
      ) : null}
      <p className="plat-bills__plan-hint" style={{ marginTop: "0.5rem" }}>
        Service bills pay for PaymentGate software. Customer payments go to your
        wallet separately.
      </p>
    </section>
  );
}
