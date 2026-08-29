import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpModal } from "../auth/MfaStepUpModal";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { SearchableSelect } from "../ui/SearchableSelect";
import {
  ApiError,
  getAgentPayout,
  listOrgs,
  putAgentPayout,
  type AgentPayoutAddress,
  type OrgAccount,
  type Session,
} from "./api";
import {
  orgTypeLabel,
  primaryAgentOrgId,
  sessionCanOnboardMerchant,
  sessionIsAgentViewerOnly,
} from "./org";
import {
  defaultLivePair,
  pairSelectLabel,
  pairsForAsset,
  uniqueAssetsFromRegistry,
} from "../shared/assetNetworks";

type Props = { session: Session };

type PendingPayout = {
  asset: string;
  network: string;
  address: string;
};

/** C12 — Agent org settings (profile + payout address). */
export function AgentSettingsPage({ session }: Props) {
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canEditPayout = useMemo(
    () => sessionCanOnboardMerchant(session),
    [session],
  );
  const isViewer = useMemo(
    () => sessionIsAgentViewerOnly(session),
    [session],
  );
  const assetOptions = useMemo(
    () => uniqueAssetsFromRegistry().map((id) => ({ id, label: id })),
    [],
  );

  const [org, setOrg] = useState<OrgAccount | null>(null);
  const [payout, setPayout] = useState<AgentPayoutAddress | null>(null);
  const [asset, setAsset] = useState<string>(defaultLivePair().asset);
  const [network, setNetwork] = useState<string>(defaultLivePair().network);
  const [address, setAddress] = useState("");
  const [pendingMfa, setPendingMfa] = useState<PendingPayout | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const networkOptions = useMemo(
    () =>
      pairsForAsset(asset)
        .filter((row) => row.enabled)
        .map((row) => ({ id: row.network, label: pairSelectLabel(row) })),
    [asset],
  );

  function onAssetChange(nextAsset: string) {
    setAsset(nextAsset);
    const live = pairsForAsset(nextAsset).find((row) => row.enabled);
    if (live) setNetwork(live.network);
  }

  const dismissToast = useCallback(() => {
    setError(null);
    setSavedMsg(null);
  }, []);

  const load = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      setError("No agent membership on this session");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [orgs, payoutRow] = await Promise.all([
        listOrgs(),
        getAgentPayout(agentId).catch(() => null),
      ]);
      setOrg(orgs.find((o) => o.id === agentId) ?? null);
      setPayout(payoutRow);
      if (payoutRow) {
        setAsset(payoutRow.asset);
        setNetwork(payoutRow.network);
        setAddress(payoutRow.pendingAddress ?? payoutRow.address);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load settings",
      );
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSavePayout(e: FormEvent) {
    e.preventDefault();
    if (!agentId || !canEditPayout) return;
    const next = address.trim();
    if (!next) return;
    setError(null);
    setSavedMsg(null);
    setPendingMfa({
      asset: asset.trim(),
      network: network.trim(),
      address: next,
    });
  }

  async function verifyPayoutMfa(mfaCode: string) {
    if (!agentId || !pendingMfa) return;
    try {
      const row = await putAgentPayout(agentId, {
        asset: pendingMfa.asset,
        network: pendingMfa.network,
        address: pendingMfa.address,
        mfaCode,
      });
      setPayout(row);
      setAddress(row.pendingAddress ?? row.address);
      if (row.pendingActivatesAt) {
        setSavedMsg(
          `Payout address change pending — activates ${new Date(row.pendingActivatesAt).toLocaleString()}`,
        );
      } else {
        setSavedMsg("Payout address saved");
      }
    } catch (err) {
      throw new Error(
        err instanceof ApiError ? err.message : "Failed to save payout address",
      );
    }
  }

  if (loading) {
    return (
      <PlatformPending
        title="Loading agent settings"
        copy="Fetching org profile and payout address."
      />
    );
  }

  return (
    <div className="plat-settings plat-settings--agent">
      <AuthToast
        message={error ?? savedMsg}
        tone={error ? "error" : "ok"}
        onDismiss={dismissToast}
      />

      <div className="plat-settings__grid plat-settings__grid--single">
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Org profile</h2>
          </div>
          <div className="plat-settings__card-body">
            <dl className="plat-settings__dl plat-settings__dl--rows">
              <div>
                <dt>Display name</dt>
                <dd>{org?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{org ? orgTypeLabel(org.type) : "—"}</dd>
              </div>
              <div>
                <dt>Billing email</dt>
                <dd>{org?.billingEmail?.trim() || "—"}</dd>
              </div>
              <div>
                <dt>Country</dt>
                <dd>{org?.country?.trim() || "—"}</dd>
              </div>
              <div>
                <dt>Legal name</dt>
                <dd>{org?.legalName?.trim() || "—"}</dd>
              </div>
            </dl>
            <p className="plat-settings__card-note">
              Profile edits and branding land in a later release. Contact
              platform support for legal-entity changes.
            </p>
          </div>
        </section>

        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">
              Commission payout address
            </h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Watch-only destination for platform (or parent-agent) commission
              slips. CryptoGate never holds spend keys. You confirm with
              authenticator MFA on save; changes enter a cool-down before they
              become active.
            </p>
            {payout?.pendingActivatesAt ? (
              <p className="plat-settings__notice" role="status">
                Pending address <code>{payout.pendingAddress ?? "—"}</code>{" "}
                activates{" "}
                {new Date(payout.pendingActivatesAt).toLocaleString()}.
                Commission slips still use the active address until then.
              </p>
            ) : null}
            {canEditPayout ? (
              <form
                className="plat-settings__payout-form"
                onSubmit={onSavePayout}
              >
                <label className="plat-settings__field">
                  <span>Asset</span>
                  <SearchableSelect
                    value={asset}
                    options={assetOptions}
                    onChange={onAssetChange}
                    allowEmpty={false}
                    placeholder="Asset"
                    ariaLabel="Payout asset"
                  />
                </label>
                <label className="plat-settings__field">
                  <span>Network</span>
                  <SearchableSelect
                    value={network}
                    options={networkOptions}
                    onChange={setNetwork}
                    allowEmpty={false}
                    placeholder="Network"
                    ariaLabel="Payout network"
                  />
                </label>
                <label className="plat-settings__field">
                  <span>Address</span>
                  <input
                    className="plat-settings__input"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="T…"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="btn-primary plat-settings__submit"
                  disabled={!address.trim()}
                >
                  {payout ? "Update address" : "Save address"}
                </button>
              </form>
            ) : (
              <dl className="plat-settings__dl plat-settings__dl--rows">
                <div>
                  <dt>Active destination</dt>
                  <dd className="mono">
                    {payout?.address
                      ? `${payout.asset} · ${payout.network} · ${payout.address}`
                      : "Not set — ask an Owner or Administrator"}
                  </dd>
                </div>
                {payout?.pendingActivatesAt ? (
                  <div>
                    <dt>Pending</dt>
                    <dd className="mono">
                      {payout.pendingAddress ?? "—"} · activates{" "}
                      {new Date(payout.pendingActivatesAt).toLocaleString()}
                    </dd>
                  </div>
                ) : null}
              </dl>
            )}
          </div>
        </section>

        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Notifications</h2>
            {isViewer ? (
              <span className="plat-settings__badge">Viewer · read-only</span>
            ) : null}
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Email alerts for overdue merchant bills and commission statements.
              Preference toggles arrive with the notification service.
            </p>
            <ul className="plat-settings__pref-list" aria-disabled>
              <li>
                <label>
                  <input type="checkbox" disabled checked readOnly />
                  Overdue service bills
                </label>
              </li>
              <li>
                <label>
                  <input type="checkbox" disabled checked readOnly />
                  Monthly commission statement
                </label>
              </li>
            </ul>
          </div>
        </section>
      </div>

      {pendingMfa ? (
        <MfaStepUpModal
          onClose={() => setPendingMfa(null)}
          onVerify={verifyPayoutMfa}
        />
      ) : null}
    </div>
  );
}
