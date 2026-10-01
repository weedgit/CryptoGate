import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  listPosTerminals,
  revokePosTerminal,
  type OrgAccount,
  type PosTerminal,
} from "./api";
import { getMerchantOrgs } from "./merchantOrgList";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";
import { ConfirmActionModal } from "../shared/ConfirmActionModal";
import { OrgBrandMark } from "../shared/OrgBrandMark";
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

function PosDeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="2.5" width="12" height="19" rx="2.4" />
      <rect x="8.5" y="5.5" width="7" height="5" rx="0.8" />
      <path d="M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01" />
    </svg>
  );
}

function RevokeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v8" />
      <path d="M7.1 6.3a7.5 7.5 0 1 0 9.8 0" />
    </svg>
  );
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
      setTerminals((prev) => (prev ?? []).map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
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
          <span className="pos-terminals__head-icon" aria-hidden>
            <PosDeviceIcon />
          </span>
          <div className="pos-terminals__title">
            <h2>
              POS terminals
              {terminals !== null && !loadError ? (
                <span className="pos-terminals__count">{active.length} active</span>
              ) : null}
            </h2>
            <p>Devices signed in to the POS app. Revoke a lost device to sign it out.</p>
          </div>
          <div className="pos-terminals__tools">
            {orgOptions.length > 1 ? (
              <div className="plat-team__role-picker pos-terminals__org">
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
              <button
                type="button"
                className={`pos-terminals__toggle${showRevoked ? " is-on" : ""}`}
                aria-pressed={showRevoked}
                onClick={() => setShowRevoked((v) => !v)}
              >
                <span className="pos-terminals__toggle-track" aria-hidden>
                  <span className="pos-terminals__toggle-thumb" />
                </span>
                Show revoked ({revokedCount})
              </button>
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
          <>
          <div className="plat-team__table-wrap">
            <table className="plat-team__table plat-team__table--dense">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>{org.type === "merchant" ? "Merchant & set up by" : "Site & set up by"}</th>
                  <th>Set up</th>
                  <th>Last seen</th>
                  <th>Status</th>
                  <th className="plat-team__th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const revoked = t.status !== "active";
                  const isSite = t.orgType === "merchant_site";
                  const siteUnderMerchant = isSite && org.type === "merchant";
                  const partyName = siteUnderMerchant ? org.name : t.orgName || org.name;
                  const partyIcon = t.orgIconKey ?? (siteUnderMerchant ? org.iconKey : null) ?? null;
                  return (
                    <tr key={t.id} className={revoked ? "pos-terminals__row--revoked" : undefined}>
                      <td>
                        <div className="pos-terminals__device">
                          <span className="pos-terminals__device-icon" aria-hidden>
                            <PosDeviceIcon />
                          </span>
                          <span className="pos-terminals__device-copy">
                            <span className="pos-terminals__device-name">{deviceLabel(t)}</span>
                            {t.appVersion ? (
                              <span className="pos-terminals__device-version">v{t.appVersion}</span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="invoice-list__party">
                          <OrgBrandMark
                            name={partyName}
                            iconKey={partyIcon}
                            size={40}
                            className="invoice-list__party-mark"
                          />
                          <div className="invoice-list__party-body">
                            <div className="invoice-list__party-merchant">
                              <span className="invoice-list__party-name">{partyName}</span>
                              {siteUnderMerchant && t.orgName ? (
                                <span className="invoice-list__site"> · {t.orgName}</span>
                              ) : null}
                            </div>
                            <div className="invoice-list__party-cashier" title={t.boundByEmail ?? undefined}>
                              <span className="invoice-list__user-avatar" aria-hidden>
                                {t.boundByAvatarUrl ? (
                                  <img src={t.boundByAvatarUrl} alt="" />
                                ) : (
                                  <DefaultUserAvatar className="invoice-list__user-avatar-default" />
                                )}
                              </span>
                              <span className="invoice-list__cashier-name">{boundByLabel(t)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="plat-team__login" title={formatViewerDateTime(t.createdAt)}>
                        {formatRelativeTime(t.createdAt)}
                      </td>
                      <td
                        className="plat-team__login"
                        title={t.lastSeenAt ? formatViewerDateTime(t.lastSeenAt) : undefined}
                      >
                        {formatRelativeTime(t.lastSeenAt)}
                      </td>
                      <td>
                        <span
                          className={`plat-team__mfa pos-terminals__status ${revoked ? "is-revoked" : "is-on"}`}
                          title={
                            revoked && t.revokedAt
                              ? `Revoked ${formatViewerDateTime(t.revokedAt)}${t.revokeReason ? ` (${t.revokeReason})` : ""}`
                              : undefined
                          }
                        >
                          <span className="plat-team__mfa-dot" aria-hidden />
                          {revoked ? "Revoked" : "Active"}
                        </span>
                      </td>
                      <td className="plat-team__td-actions">
                        {revoked ? (
                          <span className="plat-team__actions-empty">—</span>
                        ) : (
                          <div className="plat-team__actions">
                            <button
                              type="button"
                              className="plat-team__action plat-team__action--icon is-danger"
                              aria-label={`Revoke ${deviceLabel(t)}`}
                              title="Revoke"
                              disabled={busy}
                              onClick={() => setRevokeTarget(t)}
                            >
                              <RevokeIcon />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="plat-team__count">
            Showing {visible.length} {visible.length === 1 ? "terminal" : "terminals"}
          </p>
          </>
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
