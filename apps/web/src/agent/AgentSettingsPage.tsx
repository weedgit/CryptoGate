import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  isPlatformFeePair,
  isTronReceiveAddress,
  PLATFORM_FEE_ASSET,
} from "@paymentgate/domain";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpGate } from "../auth/MfaStepUpGate";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { truncateAddress } from "../platform/orgDetailSeeds";
import { PagePending } from "../platform/ui/PlatformPending";
import { FieldControl } from "../ui/FieldControl";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { platformFeeNetwork } from "../shared/platformFeePair";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import {
  ApiError,
  getAgentPayout,
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

type Props = { session: Session };

type PendingPayout = {
  asset: string;
  network: string;
  address: string;
};

function profileValue(raw: string | null | undefined): {
  text: string;
  empty: boolean;
} {
  const text = raw?.trim() ?? "";
  return text ? { text, empty: false } : { text: "Not provided", empty: true };
}

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
  const feeNetworkLabel = useMemo(
    () => displayNetworkForPair(PLATFORM_FEE_ASSET, platformFeeNetwork()),
    [],
  );

  const [org, setOrg] = useState<OrgAccount | null>(() =>
    agentId ? (peekAgentOrgs()?.find((o) => o.id === agentId) ?? null) : null,
  );
  const [payout, setPayout] = useState<AgentPayoutAddress | null>(null);
  const [address, setAddress] = useState("");
  const [pendingMfa, setPendingMfa] = useState<PendingPayout | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () => !(agentId && peekAgentOrgs()?.some((o) => o.id === agentId)),
  );
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

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
    if (!peekAgentOrgs()?.some((o) => o.id === agentId)) setLoading(true);
    setError(null);
    try {
      const [orgs, payoutRow] = await Promise.all([
        getAgentOrgs(),
        getAgentPayout(agentId).catch(() => null),
      ]);
      setOrg(orgs.find((o) => o.id === agentId) ?? null);
      setPayout(payoutRow);
      if (payoutRow) {
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

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("agent-topbar-center"));
  }, []);

  function onSavePayout(e: FormEvent) {
    e.preventDefault();
    if (!agentId || !canEditPayout) return;
    const next = address.trim();
    if (!next) return;
    if (!isTronReceiveAddress(next)) {
      setError("Payout address must be a Tron (TRC-20) receive address");
      return;
    }
    setError(null);
    setSavedMsg(null);
    setPendingMfa({
      asset: PLATFORM_FEE_ASSET,
      network: platformFeeNetwork(),
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

  const country = profileValue(org?.country);
  const legalName = profileValue(org?.legalName);
  const payoutPairLabel = payout
    ? isPlatformFeePair(payout.asset, payout.network)
      ? `${PLATFORM_FEE_ASSET} · ${feeNetworkLabel}`
      : `${payout.asset} · ${payout.network}`
    : `${PLATFORM_FEE_ASSET} · ${feeNetworkLabel}`;

  if (loading) {
    return <PagePending />;
  }

  return (
    <div className="plat-settings plat-settings--agent agent-settings">
      {topbarSlot
        ? createPortal(
            <p className="plat-commissions__topbar-title">Settings</p>,
            topbarSlot,
          )
        : null}

      <AuthToast
        message={error ?? savedMsg}
        tone={error ? "error" : "ok"}
        onDismiss={dismissToast}
      />

      <div className="plat-settings__grid agent-settings__grid">
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Organization</h2>
          </div>
          <div className="plat-settings__card-body">
            <dl className="plat-settings__dl plat-settings__dl--rows">
              <div>
                <dt>Name</dt>
                <dd>{org?.name ?? "Agent"}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{org ? orgTypeLabel(org.type) : "Agent"}</dd>
              </div>
              <div>
                <dt>Country</dt>
                <dd className={country.empty ? "is-empty" : undefined}>
                  {country.text}
                </dd>
              </div>
              <div>
                <dt>Legal name</dt>
                <dd className={legalName.empty ? "is-empty" : undefined}>
                  {legalName.text}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Commission payout</h2>
            {isViewer ? (
              <span className="plat-settings__badge">Viewer · read-only</span>
            ) : null}
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              USDT on Tron receives commission rebates from the platform.
              Address changes require MFA and a short cooldown before they go
              live.
            </p>

            {payout?.address ? (
              <dl className="plat-settings__dl plat-settings__dl--rows">
                <div>
                  <dt>Active destination</dt>
                  <dd>{payoutPairLabel}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>
                    <CopyableChainValue
                      value={payout.address}
                      network={payout.network?.trim() || "tron"}
                      kind="address"
                      display={truncateAddress(payout.address, 10, 8)}
                    />
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="plat-settings__card-note">
                No payout address on file. Add a USDT (TRC-20) wallet so
                commission invoices have a settlement destination.
              </p>
            )}

            {payout?.pendingActivatesAt ? (
              <p className="plat-settings__notice" role="status">
                Pending <code>{payout.pendingAddress ?? "—"}</code> activates{" "}
                {new Date(payout.pendingActivatesAt).toLocaleString()}. Slips
                use the active address until then.
              </p>
            ) : null}

            {canEditPayout ? (
              <form
                className="plat-settings__payout-form"
                onSubmit={onSavePayout}
              >
                <div
                  className="plat-fee-billing__rail agent-settings__rail"
                  aria-label={`Commission payouts: ${PLATFORM_FEE_ASSET} on ${feeNetworkLabel}`}
                >
                  <span className="plat-fee-billing__rail-chip">
                    <AssetIcon asset={PLATFORM_FEE_ASSET} />
                    <span>{PLATFORM_FEE_ASSET}</span>
                  </span>
                  <span className="plat-fee-billing__rail-sep" aria-hidden>
                    ·
                  </span>
                  <span className="plat-fee-billing__rail-chip">
                    <NetworkIcon network={platformFeeNetwork()} />
                    <span>{feeNetworkLabel}</span>
                  </span>
                </div>

                <label className="plat-settings__field" htmlFor="agent-payout-address">
                  <span>Payout address</span>
                  <FieldControl icon="coins">
                    <input
                      id="agent-payout-address"
                      className="plat-settings__input mono"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Paste Tron address (starts with T)"
                      autoComplete="off"
                      spellCheck={false}
                      required
                    />
                  </FieldControl>
                </label>

                <p className="plat-settings__card-note">
                  TRC-20 receive address only. Authenticator MFA required before
                  saving.
                </p>

                <button
                  type="submit"
                  className="plat-settings__save"
                  disabled={!address.trim()}
                >
                  {payout?.address ? "Update address" : "Save address"}
                </button>
              </form>
            ) : (
              <p className="plat-settings__card-note">
                {payout?.address
                  ? "Owner or Administrator can rotate this address."
                  : "Ask an Owner or Administrator to set a payout address."}
              </p>
            )}
          </div>
        </section>

        <section className="plat-settings__card agent-settings__card--span">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Notifications</h2>
          </div>
          <div className="plat-settings__card-body">
            <ul className="plat-settings__pref-list">
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
        <MfaStepUpGate
          session={session}
          actionLabel="save commission payout address"
          onClose={() => setPendingMfa(null)}
          onVerify={verifyPayoutMfa}
        />
      ) : null}
    </div>
  );
}
