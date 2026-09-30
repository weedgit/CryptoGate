import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  listPosTerminals,
  revokePosTerminal,
  type OrgAccount,
  type PosTerminal,
} from "./api";
import { getMerchantOrgs } from "./merchantOrgList";
import { ConfirmActionModal } from "../shared/ConfirmActionModal";
import { formatRelativeTime } from "../shared/relativeTime";
import { formatViewerDateTime } from "../shared/dateTime";
import { SearchableSelect } from "../ui/SearchableSelect";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { usePageRefresh } from "../shared/pageRefresh";

type Props = {
  /** The Team page's org (the signed-in user's own merchant or site). */
  org: OrgAccount;
  onOk: (message: string) => void;
  onError: (message: string) => void;
};

function deviceLabel(t: PosTerminal) {
  return t.deviceModel?.trim() || "POS device";
}

function boundByLabel(t: PosTerminal) {
  return t.boundByName || t.boundByEmail || "—";
}

/** Owner/Admin: POS devices bound to the org (and, for a merchant, its sites), with Revoke. */
export function PosTerminalsSection({ org, onOk, onError }: Props) {
  const [sites, setSites] = useState<OrgAccount[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(org.id);
  const [terminals, setTerminals] = useState<PosTerminal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PosTerminal | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelectedOrgId(org.id);
    if (org.type !== "merchant") {
      setSites([]);
      return;
    }
    void getMerchantOrgs()
      .then((rows) =>
        setSites(
          rows
            .filter((o) => o.type === "merchant_site" && o.parentId === org.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch(() => setSites([]));
  }, [org.id, org.type]);

  const orgOptions = useMemo(
    () => [
      { id: org.id, label: `${org.name} (merchant)` },
      ...sites.map((s) => ({ id: s.id, label: s.name })),
    ],
    [org.id, org.name, sites],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setTerminals(await listPosTerminals(selectedOrgId));
    } catch (err) {
      setTerminals([]);
      setLoadError(err instanceof ApiError ? err.message : "Could not load POS terminals");
    }
  }, [selectedOrgId]);

  useEffect(() => {
    setTerminals(null);
    void load();
  }, [load]);
  usePageRefresh(() => load());

  const active = useMemo(
    () => (terminals ?? []).filter((t) => t.status === "active"),
    [terminals],
  );
  const revokedCount = (terminals?.length ?? 0) - active.length;
  const visible = showRevoked ? (terminals ?? []) : active;

  async function confirmRevoke() {
    const target = revokeTarget;
    if (!target) return;
    setBusy(true);
    try {
      const updated = await revokePosTerminal(selectedOrgId, target.id, "revoked from web");
      setTerminals((prev) => (prev ?? []).map((t) => (t.id === updated.id ? updated : t)));
      onOk(`${deviceLabel(target)} was revoked and signed out.`);
      setRevokeTarget(null);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not revoke the POS terminal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="plat-bills__panel plat-team__panel plat-team__panel--solo pos-terminals">
      <div className="plat-bills__main">
        <header className="pos-terminals__head">
          <div className="pos-terminals__title">
            <h2>POS terminals</h2>
            <p>
              Devices set up for the POS app. Revoke a lost or retired device to sign it out; it
              must be set up again by an Owner or Administrator.
            </p>
          </div>
          <div className="pos-terminals__tools">
            {orgOptions.length > 1 ? (
              <div className="pos-terminals__org">
                <SearchableSelect
                  value={selectedOrgId}
                  options={orgOptions}
                  onChange={(id) => id && setSelectedOrgId(id)}
                  allowEmpty={false}
                  placeholder="Org"
                  ariaLabel="Show POS terminals for"
                  menuMinWidth={220}
                />
              </div>
            ) : null}
            {revokedCount > 0 ? (
              <label className="pos-terminals__toggle">
                <input
                  type="checkbox"
                  checked={showRevoked}
                  onChange={(e) => setShowRevoked(e.target.checked)}
                />
                Show revoked ({revokedCount})
              </label>
            ) : null}
          </div>
        </header>

        {terminals === null ? (
          <PlatformPending compact title="Loading POS terminals" copy="Fetching devices." />
        ) : loadError ? (
          <p className="plat-team__empty">{loadError}</p>
        ) : visible.length === 0 ? (
          <p className="plat-team__empty">
            {active.length === 0 && revokedCount > 0
              ? "No active POS terminals. Turn on “Show revoked” to see earlier devices."
              : "No POS terminals yet. An Owner or Administrator sets one up by signing in on the POS app."}
          </p>
        ) : (
          <div className="plat-team__table-wrap">
            <table className="plat-team__table plat-team__table--dense">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>App version</th>
                  <th>Set up by</th>
                  <th>Set up</th>
                  <th>Last seen</th>
                  <th>Status</th>
                  <th className="plat-team__th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const revoked = t.status !== "active";
                  return (
                    <tr key={t.id} className={revoked ? "pos-terminals__row--revoked" : undefined}>
                      <td className="pos-terminals__device">{deviceLabel(t)}</td>
                      <td>{t.appVersion ?? "—"}</td>
                      <td title={t.boundByEmail ?? undefined}>{boundByLabel(t)}</td>
                      <td title={formatViewerDateTime(t.createdAt)}>
                        {formatRelativeTime(t.createdAt)}
                      </td>
                      <td title={t.lastSeenAt ? formatViewerDateTime(t.lastSeenAt) : undefined}>
                        {formatRelativeTime(t.lastSeenAt)}
                      </td>
                      <td>
                        <span
                          className={`pos-terminals__status ${revoked ? "is-revoked" : "is-active"}`}
                          title={
                            revoked && t.revokedAt
                              ? `Revoked ${formatViewerDateTime(t.revokedAt)}${t.revokeReason ? ` (${t.revokeReason})` : ""}`
                              : undefined
                          }
                        >
                          {revoked ? "Revoked" : "Active"}
                        </span>
                      </td>
                      <td className="plat-team__td-actions">
                        {revoked ? (
                          <span className="plat-team__actions-empty">—</span>
                        ) : (
                          <button
                            type="button"
                            className="pos-terminals__revoke"
                            disabled={busy}
                            onClick={() => setRevokeTarget(t)}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {revokeTarget ? (
        <ConfirmActionModal
          title="Revoke POS terminal?"
          subject={deviceLabel(revokeTarget)}
          message="Whoever is using this device is signed out now, and no PIN will unlock it. To use it again, an Owner or Administrator must set it up again in the POS app."
          confirmLabel={busy ? "Revoking…" : "Revoke"}
          tone="danger"
          onConfirm={() => {
            if (!busy) void confirmRevoke();
          }}
          onCancel={() => {
            if (!busy) setRevokeTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}
