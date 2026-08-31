import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpModal } from "../auth/MfaStepUpModal";
import {
  ApiError,
  decideSiteOverride,
  getFulfillmentPolicy,
  getMatchingMode,
  getRetention,
  listSiteOverrides,
  requestSiteOverride,
  type Session,
  type SiteSettingOverride,
} from "./api";
import { sessionRoleOnOrg } from "./org";

const KINDS: Array<{ id: SiteSettingOverride["settingKind"]; label: string }> = [
  { id: "matching_mode", label: "Matching mode" },
  { id: "fulfillment_policy", label: "Fulfillment policy" },
  { id: "settlement", label: "Settlement address" },
  { id: "xpub", label: "xPub (Mode S)" },
  { id: "order_retention", label: "Order retention" },
];

type Props = {
  session: Session;
  siteId: string;
  parentId: string | null;
};

export function SiteOverridesPanel({ session, siteId, parentId }: Props) {
  const siteRole = sessionRoleOnOrg(session, siteId);
  const parentRole = parentId ? sessionRoleOnOrg(session, parentId) : null;
  const canRequest = siteRole === "owner" || siteRole === "administrator";
  const canDecide = parentRole === "owner";

  const [rows, setRows] = useState<SiteSettingOverride[]>([]);
  const [source, setSource] = useState<string>("inherit");
  const [retentionDays, setRetentionDays] = useState<number>(90);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<SiteSettingOverride["settingKind"]>("matching_mode");
  const [matchingMode, setMatchingMode] = useState("B");
  const [fulfillmentPolicy, setFulfillmentPolicy] = useState("on_completed");
  const [address, setAddress] = useState("");
  const [xPub, setXPub] = useState("");
  const [days, setDays] = useState("90");
  const [denyReason, setDenyReason] = useState("");
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [ov, mode, fulfillment, ret] = await Promise.all([
        listSiteOverrides(siteId),
        getMatchingMode(siteId),
        getFulfillmentPolicy(siteId),
        getRetention(siteId),
      ]);
      setRows(ov);
      setSource(mode.source ?? "inherit");
      setFulfillmentPolicy(fulfillment.fulfillmentPolicy);
      setRetentionDays(ret.orderDeleteDays);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load overrides");
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    if (!canRequest) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payload =
        kind === "matching_mode"
          ? { matchingMode }
          : kind === "fulfillment_policy"
            ? { fulfillmentPolicy }
            : kind === "order_retention"
              ? { orderDeleteDays: Number(days) }
              : kind === "settlement"
                ? { asset: "USDT", network: "tron", address: address.trim() }
                : { asset: "USDT", network: "tron", xPub: xPub.trim() };
      await requestSiteOverride(siteId, { settingKind: kind, payload });
      setAddress("");
      setXPub("");
      setSuccess("Override request submitted");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeny(id: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await decideSiteOverride(siteId, id, {
        decision: "deny",
        reason: denyReason.trim() || undefined,
      });
      setDenyReason("");
      setSuccess("Override denied");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  function onApproveClick(id: string) {
    const row = pending.find((r) => r.id === id);
    const needsMfa =
      row?.settingKind === "settlement" || row?.settingKind === "xpub";
    if (needsMfa) {
      setError(null);
      setSuccess(null);
      setPendingApproveId(id);
      return;
    }
    void approveWithoutMfa(id);
  }

  async function approveWithoutMfa(id: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await decideSiteOverride(siteId, id, { decision: "approve" });
      setSuccess("Override approved");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyApproveMfa(mfaCode: string) {
    if (!pendingApproveId) return;
    try {
      await decideSiteOverride(siteId, pendingApproveId, {
        decision: "approve",
        mfaCode,
      });
      setSuccess("Override approved");
      await load();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Decision failed");
    }
  }

  return (
    <div className="panel settings-panel">
      <AuthToast
        message={error ?? success}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setSuccess(null);
        }}
      />
      <h2>Inherit vs override</h2>
      <p className="muted settings-note">
        Wallet, xPub, matching mode, fulfillment policy, and order retention
        inherit from the parent merchant until the parent Owner approves a site
        override. Current matching source: <strong>{source}</strong>. Fulfillment:{" "}
        <strong>{fulfillmentPolicy}</strong>. Retention: {retentionDays} days.
      </p>

      {canRequest ? (
        <form onSubmit={onRequest} className="settings-field" style={{ display: "grid", gap: 8 }}>
          <label className="settings-filter">
            <span>Request override</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          {kind === "matching_mode" ? (
            <label className="settings-filter">
              <span>Mode</span>
              <select value={matchingMode} onChange={(e) => setMatchingMode(e.target.value)}>
                <option value="B">B Standard</option>
                <option value="C">C Amount fingerprint</option>
                <option value="D">D Memo tag</option>
                <option value="S">S Smart address</option>
              </select>
            </label>
          ) : null}
          {kind === "fulfillment_policy" ? (
            <label className="settings-filter">
              <span>Policy</span>
              <select
                value={fulfillmentPolicy}
                onChange={(e) => setFulfillmentPolicy(e.target.value)}
              >
                <option value="on_completed">Standard (on completed)</option>
                <option value="on_verifying">Counter (on verifying)</option>
              </select>
            </label>
          ) : null}
          {kind === "settlement" ? (
            <label className="settings-filter">
              <span>USDT TRC-20 address</span>
              <input
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="off"
              />
            </label>
          ) : null}
          {kind === "xpub" ? (
            <label className="settings-filter">
              <span>Watch-only xPub</span>
              <input
                required
                value={xPub}
                onChange={(e) => setXPub(e.target.value)}
                autoComplete="off"
              />
            </label>
          ) : null}
          {kind === "order_retention" ? (
            <label className="settings-filter">
              <span>Delete after (days)</span>
              <input
                required
                type="number"
                min={7}
                max={3650}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
          ) : null}
          <button type="submit" className="btn-primary btn-inline" disabled={busy}>
            Submit request
          </button>
        </form>
      ) : null}

      {canDecide && pending.length > 0 ? (
        <div>
          <p className="settings-label">Pending parent approval</p>
          {pending.map((row) => (
            <div key={row.id} className="settings-field">
              <span>
                {row.settingKind.replace(/_/g, " ")} · {row.status}
              </span>
              <div className="orders-actions">
                <button
                  type="button"
                  className="btn-primary btn-inline"
                  disabled={busy}
                  onClick={() => onApproveClick(row.id)}
                >
                  Approve
                </button>
                <input
                  placeholder="Deny reason"
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost btn-inline"
                  disabled={busy}
                  onClick={() => void onDeny(row.id)}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="table">
          <div className="table-head">
            <span>Kind</span>
            <span>Status</span>
            <span>Created</span>
          </div>
          {rows.map((row) => (
            <div className="table-row" key={row.id}>
              <span>{row.settingKind.replace(/_/g, " ")}</span>
              <span className="pill">{row.status}</span>
              <span className="muted">{row.createdAt.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No override requests yet.</p>
      )}

      {pendingApproveId ? (
        <MfaStepUpModal
          onClose={() => setPendingApproveId(null)}
          onVerify={verifyApproveMfa}
        />
      ) : null}
    </div>
  );
}
