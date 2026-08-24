import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  getPlatformOrgPolicy,
  updatePlatformOrgPolicy,
  type Session,
} from "./api";
import { sessionIsPlatformOwner } from "./org";

type Props = { session: Session };

export function PlatformSettingsPage({ session }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const [maxAgentDepth, setMaxAgentDepth] = useState("2");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const policy = await getPlatformOrgPolicy();
      setMaxAgentDepth(String(policy.maxAgentDepth));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSavePolicy(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const depth = Number(maxAgentDepth);
    if (!Number.isInteger(depth) || depth < 0 || depth > 5) {
      setError("Max agent depth must be an integer 0–5");
      return;
    }
    if (
      !window.confirm(
        "Lowering max agent depth may block new sub-agents. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const policy = await updatePlatformOrgPolicy({ maxAgentDepth: depth });
      setMaxAgentDepth(String(policy.maxAgentDepth));
      setMessage("Org policy updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update policy");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading platform settings…</p>;
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Global platform settings</h2>
          <Link className="btn-secondary" to="/platform/settings/fee-tiers">
            Fee tiers (B8)
          </Link>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Security, networks, notifications, and API rate limits ship in later
          B13 sections — org policy is live below.
        </p>
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <h3>Org policy</h3>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="banner banner-ok">{message}</p> : null}
        <form className="form-stack" onSubmit={onSavePolicy}>
          <div className="field">
            <label htmlFor="max-depth">Max agent nesting depth</label>
            <input
              id="max-depth"
              className="field-control"
              type="number"
              min={0}
              max={5}
              value={maxAgentDepth}
              onChange={(e) => setMaxAgentDepth(e.target.value)}
              disabled={!canEdit || busy}
            />
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
              Phase 1 default is 2 (agent → agent sub → merchant). Onboard agent
              wizard links here when depth is exceeded.
            </p>
          </div>
          {canEdit ? (
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save org policy"}
            </button>
          ) : (
            <p style={{ color: "var(--muted)" }}>
              Platform Owner only — Viewers and Administrators are read-only.
            </p>
          )}
        </form>
      </div>
    </>
  );
}
