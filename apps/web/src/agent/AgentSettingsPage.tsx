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
} from "@cryptogate/domain";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpGate } from "../auth/MfaStepUpGate";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { truncateAddress } from "../platform/orgDetailSeeds";
import { PlatformPending } from "../platform/ui/PlatformPending";
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

function orgInitial(name: string | undefined): string {
  const ch = name?.trim().charAt(0);
  return ch ? ch.toUpperCase() : "A";
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

  if (loading) {
    return (
      <PlatformPending
        title="Loading agent settings"
        copy="Fetching org profile and payout address."
      />
    );
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

      <div className="agent-settings__layout">
        <section className="plat-settings__card agent-settings__card">
          <div className="agent-settings__identity">
            <div className="agent-settings__avatar" aria-hidden>
              {orgInitial(org?.name)}
            </div>
            <div className="agent-settings__identity-copy">
              <p className="agent-settings__kicker">Organization</p>
              <h2 className="agent-settings__name">{org?.name ?? "Agent"}</h2>
              <span className="agent-settings__type">
                {org ? orgTypeLabel(org.type) : "Agent"}
              </span>
            </div>
          </div>
          <dl className="agent-settings__meta">
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
        </section>

        <section className="plat-settings__card agent-settings__card">
          <header className="agent-settings__card-head">
            <div>
              <p className="agent-settings__kicker">Remittance</p>
              <h2 className="agent-settings__card-title">
                Commission payout
              </h2>
            </div>
            {isViewer ? (
              <span className="plat-settings__badge">Viewer · read-only</span>
            ) : null}
          </header>
          <div className="agent-settings__card-body">
            {payout?.address ? (
              <div className="agent-settings__active">
                <p className="agent-settings__active-label">Active destination</p>
                <p className="agent-settings__active-pair">
                  {isPlatformFeePair(payout.asset, payout.network)
                    ? `${PLATFORM_FEE_ASSET} · ${feeNetworkLabel}`
                    : `${payout.asset} · ${payout.network}`}
                </p>
                <CopyableChainValue
                  value={payout.address}
                  network={payout.network?.trim() || "tron"}
                  kind="address"
                  display={truncateAddress(payout.address, 10, 8)}
                />
              </div>
            ) : (
              <p className="agent-settings__hint">
                Set a USDT (TRC-20) address so commission slips have a
                destination. Platform fees settle on Tron only.
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
                className="plat-settings__payout-form agent-settings__form"
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
                <label className="plat-settings__field">
                  <span>Address</span>
                  <input
                    className="plat-settings__input agent-settings__address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="T…"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </label>
                <div className="agent-settings__actions">
                  <p className="agent-settings__hint">
                    Authenticator MFA required. USDT on Tron only — changes cool
                    down before they go live.
                  </p>
                  <button
                    type="submit"
                    className="btn-primary plat-settings__submit"
                    disabled={!address.trim()}
                  >
                    {payout ? "Update address" : "Save address"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="agent-settings__hint">
                {payout?.address
                  ? "Owner or Administrator can rotate this address."
                  : "Ask an Owner or Administrator to set a payout address."}
              </p>
            )}
          </div>
        </section>

        <section className="plat-settings__card agent-settings__card agent-settings__card--span">
          <header className="agent-settings__card-head">
            <div>
              <p className="agent-settings__kicker">Alerts</p>
              <h2 className="agent-settings__card-title">Notifications</h2>
            </div>
          </header>
          <ul className="agent-settings__prefs">
            <li>
              <div>
                <strong>Overdue service bills</strong>
                <span>
                  Email when a merchant invoice in your subtree is overdue.
                </span>
              </div>
              <label className="agent-settings__switch">
                <input type="checkbox" disabled checked readOnly />
                <span className="agent-settings__track" aria-hidden />
                <span className="sr-only">Enabled</span>
              </label>
            </li>
            <li>
              <div>
                <strong>Monthly commission statement</strong>
                <span>
                  Email when a commission invoice is issued or settled.
                </span>
              </div>
              <label className="agent-settings__switch">
                <input type="checkbox" disabled checked readOnly />
                <span className="agent-settings__track" aria-hidden />
                <span className="sr-only">Enabled</span>
              </label>
            </li>
          </ul>
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
