import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  decideEnterpriseRateApproval,
  getFeeTierSettings,
  listEnterpriseRateApprovals,
  updateFeeTierSettings,
  type EnterpriseRateApproval,
  type FeeTierBand,
  type Session,
} from "./api";
import { sessionIsPlatformOwner } from "./org";

const TIER_LABEL: Record<string, string> = {
  small: "Small",
  mid: "Mid",
  enterprise: "Enterprise",
};

type Props = { session: Session };

export function FeeTiersSettingsPage({ session }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const [tiers, setTiers] = useState<FeeTierBand[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<EnterpriseRateApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, pending] = await Promise.all([
        getFeeTierSettings(),
        listEnterpriseRateApprovals({ status: "pending" }),
      ]);
      setTiers(settings.tiers);
      setUpdatedAt(settings.updatedAt);
      setApprovals(pending);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load fee tiers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patchTier(index: number, patch: Partial<FeeTierBand>) {
    setTiers((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await updateFeeTierSettings({ tiers });
      setTiers(saved.tiers);
      setUpdatedAt(saved.updatedAt);
      setMessage("Fee tiers saved — changes apply to the next billing period.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save fee tiers");
    } finally {
      setBusy(false);
    }
  }

  async function onDecide(id: string, decision: "approve" | "deny") {
    if (!canEdit) return;
    let reason: string | undefined;
    if (decision === "deny") {
      reason = window.prompt("Denial reason (required):")?.trim();
      if (!reason) return;
    }
    setBusy(true);
    setError(null);
    try {
      await decideEnterpriseRateApproval(id, { decision, reason });
      await load();
      setMessage(decision === "approve" ? "Enterprise rate approved." : "Request denied.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading fee tiers…</p>;
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Fee tiers &amp; global pricing</h2>
        <Link className="btn-secondary" to="/platform/settings">
          Platform settings
        </Link>
      </div>

      <div className="banner banner-warn" style={{ marginBottom: 16 }}>
        Changes apply to the <strong>next billing period</strong> only — not
        retroactive on open bills.
      </div>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="banner banner-ok">{message}</p> : null}
      {updatedAt ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Last updated {new Date(updatedAt).toLocaleString()}
        </p>
      ) : null}

      <form className="form-stack" onSubmit={onSave}>
        {tiers.map((tier, index) => (
          <fieldset
            key={tier.tier}
            className="panel"
            style={{ marginBottom: 16, padding: 16 }}
            disabled={!canEdit || busy}
          >
            <legend>{TIER_LABEL[tier.tier] ?? tier.tier}</legend>
            <div className="field-row">
              <div className="field">
                <label>Subscription (USD)</label>
                <input
                  className="field-control"
                  value={tier.subscriptionAmountUsd}
                  onChange={(e) =>
                    patchTier(index, { subscriptionAmountUsd: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Volume fee min %</label>
                <input
                  className="field-control"
                  value={tier.volumeFeeMinPercent}
                  onChange={(e) =>
                    patchTier(index, { volumeFeeMinPercent: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Volume fee max %</label>
                <input
                  className="field-control"
                  value={tier.volumeFeeMaxPercent}
                  onChange={(e) =>
                    patchTier(index, { volumeFeeMaxPercent: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Default signup %</label>
                <input
                  className="field-control"
                  value={tier.defaultSignupPercent}
                  onChange={(e) =>
                    patchTier(index, { defaultSignupPercent: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="field">
              <label>Help text</label>
              <input
                className="field-control"
                value={tier.tierDescription ?? ""}
                onChange={(e) =>
                  patchTier(index, { tierDescription: e.target.value })
                }
                placeholder="Tier assignment rules (optional)"
              />
            </div>
          </fieldset>
        ))}
        {canEdit ? (
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save fee tiers"}
          </button>
        ) : (
          <p style={{ color: "var(--muted)" }}>
            Platform Owner only — Administrators and Viewers are read-only (B8).
          </p>
        )}
      </form>

      <h3 style={{ marginTop: 32 }}>Enterprise rate approvals</h3>
      {approvals.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No pending Enterprise requests.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Tier</th>
              <th>Requested %</th>
              <th>When</th>
              {canEdit ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {approvals.map((row) => (
              <tr key={row.id}>
                <td>{row.merchantName}</td>
                <td>{TIER_LABEL[row.requestedTier] ?? row.requestedTier}</td>
                <td>{row.requestedVolumeFeePercent}%</td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                {canEdit ? (
                  <td className="action-row">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void onDecide(row.id, "approve")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void onDecide(row.id, "deny")}
                    >
                      Deny
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
