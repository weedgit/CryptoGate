import { Link } from "react-router-dom";
import type { Session } from "./api";
import { sessionCanCheckoutServiceBill } from "./org";

type Props = { session: Session };

export function BillingSettingsPage({ session }: Props) {
  const canPay = sessionCanCheckoutServiceBill(session);

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

      <div className="panel settings-panel">
        <h2>Current plan</h2>
        <div className="settings-field">
          <span className="settings-label">Tier</span>
          <span>Standard (display stub until fee API)</span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Volume fee</span>
          <span>Set by agent / platform — not deducted from payer on-chain</span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Next period rate</span>
          <span>—</span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Agent</span>
          <span>— (parent org name when fee API lands)</span>
        </div>
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
