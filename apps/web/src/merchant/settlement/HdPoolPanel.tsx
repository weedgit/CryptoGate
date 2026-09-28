import { FormEvent, useState } from "react";
import { MfaStepUpGate } from "../../auth/MfaStepUpGate";
import { AnimatedText } from "../../shared/AnimatedText";
import { displayNetworkForPair, xpubMaterialHint } from "../../shared/assetNetworks";
import { SETTLEMENT_ICONS } from "../SettlementSectionHead";
import {
  ApiError,
  putXpub,
  type HdPoolAddress,
  type Session,
  type XpubSettings,
} from "../api";
import { formatCountdown, truncateAddress } from "../org";
import { AssetNetworkFields, useAssetNetworkPicker } from "./AssetNetworkFields";
import type { SettlementNotify } from "./useSettlementData";

const POOL_CHIP_LIMIT = 24;

type PendingXpub = { asset: string; network: string; xPub: string };

type Props = {
  orgId: string;
  session: Session;
  xpubs: XpubSettings[];
  pool: HdPoolAddress[];
  derivePath: string;
  locked: boolean;
  notify: SettlementNotify;
  reloadXpubAndPool: () => Promise<void>;
};

/** Mode S watch-only xPub + derived address pool for one asset/network. */
export function HdPoolPanel({
  orgId,
  session,
  xpubs,
  pool,
  derivePath,
  locked,
  notify,
  reloadXpubAndPool,
}: Props) {
  const picker = useAssetNetworkPicker();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingXpub | null>(null);

  const activeXpub = xpubs.find(
    (x) => x.asset === picker.asset && x.network === picker.network,
  );
  const poolForPair = pool.filter(
    (p) => p.asset === picker.asset && p.network === picker.network,
  );
  const countBy = (status: string) => poolForPair.filter((p) => p.status === status).length;
  const hiddenChips = Math.max(0, poolForPair.length - POOL_CHIP_LIMIT);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const xPub = value.trim();
    if (locked || !xPub) return;
    notify.clear();
    setPending({ asset: picker.asset, network: picker.network, xPub });
  }

  async function verify(mfaCode: string) {
    if (!pending) return;
    setSaving(true);
    try {
      await putXpub(orgId, { ...pending, mfaCode });
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Save xPub failed");
    } finally {
      setSaving(false);
    }
    setValue("");
    notify.success("xPub saved — cool-down may apply");
    try {
      await reloadXpubAndPool();
    } catch {
      notify.error("xPub saved, but pool status could not refresh — reload the page.");
    }
  }

  return (
    <div className="plat-settlement__pool-section">
      <div className="plat-settlement__pool-section-head">
        <div className="plat-settlement__mode-title">
          <span className="stl-subhead__icon" aria-hidden>
            {SETTLEMENT_ICONS.key}
          </span>
          <h3 className="plat-settlement__form-title">HD pool (Mode S)</h3>
          <span className="plat-card-help plat-settlement__pool-help">
            <button type="button" className="plat-card-help__btn" aria-label="About HD pool">
              ?
            </button>
            <span className="plat-card-help__tip" role="tooltip">
              Watch-only key per asset/network. Derived pool addresses for{" "}
              {displayNetworkForPair(picker.asset, picker.network)} on same-amount
              conflicts. PaymentGate never sweeps or signs.
            </span>
          </span>
        </div>
        <span className="plat-settlement__pool-meta mono">{derivePath}</span>
      </div>

      <div className="plat-settlement__stats" aria-label="HD pool summary">
        <div className="plat-settlement__stat">
          <span className="plat-settlement__stat-label">xPub</span>
          <strong className="plat-settlement__stat-value">
            {activeXpub?.xPubConfigured
              ? activeXpub.pendingXPub
                ? "Cool-down"
                : "Configured"
              : "Not set"}
          </strong>
          <span className="plat-settlement__stat-hint">
            {activeXpub?.xPubConfigured
              ? activeXpub.pendingXPub
                ? formatCountdown(activeXpub.pendingActivatesAt) ?? "pending"
                : "Active for Mode S"
              : "Mode S falls back to Standard"}
          </span>
        </div>
        {(
          [
            ["Free", "FREE"],
            ["In use", "IN_USE"],
            ["Cool-down", "COOLDOWN"],
          ] as const
        ).map(([label, status]) => (
          <div key={status} className="plat-settlement__stat">
            <span className="plat-settlement__stat-label">{label}</span>
            <strong className="plat-settlement__stat-value">
              <AnimatedText text={countBy(status)} />
            </strong>
          </div>
        ))}
      </div>

      <div className="plat-settlement__chips">
        {poolForPair.length === 0 ? (
          <p className="muted plat-settlement__chips-empty">No HD pool rows yet.</p>
        ) : (
          <>
            {poolForPair.slice(0, POOL_CHIP_LIMIT).map((slot) => (
              <span
                key={slot.id}
                className={`plat-settlement__chip plat-settlement__chip--${slot.status.toLowerCase()}`}
                title={slot.receiveAddress}
              >
                {truncateAddress(slot.receiveAddress, 4, 3)} · {slot.status}
              </span>
            ))}
            {hiddenChips > 0 ? (
              <span className="plat-settlement__chip plat-settlement__chip--more">
                +{hiddenChips} more
              </span>
            ) : null}
          </>
        )}
      </div>

      {!locked ? (
        <form
          className="plat-settings__payout-form plat-settlement__form plat-settlement__form--pool"
          onSubmit={onSubmit}
        >
          <div className="plat-settlement__form-head">
            <h3 className="plat-settlement__form-title">Register or rotate xPub</h3>
          </div>
          <AssetNetworkFields
            picker={picker}
            idPrefix="xpub"
            ariaPrefix="xPub "
            disabled={saving}
          />
          <div className="plat-settlement__field-row plat-settlement__field-row--xpub">
            <label className="plat-settings__field plat-settlement__field--grow">
              <span className="plat-settlement__field-label">
                <span>xPub</span>
                <span className="plat-card-help plat-settlement__xpub-help">
                  <button
                    type="button"
                    className="plat-card-help__btn"
                    aria-label="About xPub registration"
                  >
                    ?
                  </button>
                  <span className="plat-card-help__tip" role="tooltip">
                    {xpubMaterialHint(picker.network)} MFA confirms on save. Never paste
                    spend keys or seed phrases.
                  </span>
                </span>
              </span>
              <input
                className="plat-settings__input mono"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                disabled={saving || !picker.live}
                spellCheck={false}
                autoComplete="off"
                placeholder={
                  picker.live ? "xpub… / zpub… / ed25519 pubkey…" : "Select a live pair"
                }
              />
            </label>
          </div>
          <div className="plat-settlement__form-actions">
            <button
              type="submit"
              className="btn-primary plat-settings__submit"
              disabled={saving || !picker.live}
            >
              Save xPub
            </button>
          </div>
        </form>
      ) : null}

      {pending ? (
        <MfaStepUpGate
          session={session}
          actionLabel="save extended public key"
          onClose={() => setPending(null)}
          onVerify={verify}
        />
      ) : null}
    </div>
  );
}
