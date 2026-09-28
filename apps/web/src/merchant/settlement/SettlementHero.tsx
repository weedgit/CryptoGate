import { AnimatedText } from "../../shared/AnimatedText";
import { GoldWaves } from "../../shared/GoldWaves";
import { SETTLEMENT_ICONS } from "../SettlementSectionHead";
import { fulfillmentPolicyLabel } from "../fulfillmentLabels";
import { matchingModeLabel } from "../matchingLabels";
import { formatCountdown, truncateAddress } from "../org";
import type { SettlementAddress, XpubSettings } from "../api";

type Props = {
  addresses: SettlementAddress[];
  xpubs: XpubSettings[];
  matchingMode: string;
  fulfillmentPolicy: string;
  lockChip: string | null;
};

export function SettlementHero({
  addresses,
  xpubs,
  matchingMode,
  fulfillmentPolicy,
  lockChip,
}: Props) {
  const cooling = addresses.filter((a) => a.status === "pending_cool_down");
  const nextCooldown = cooling[0];
  const xpubConfiguredCount = xpubs.filter((x) => x.xPubConfigured).length;

  return (
    <header className="stl-hero">
      <div className="stl-hero__top">
        <span className="stl-hero__icon" aria-hidden>
          {SETTLEMENT_ICONS.vault}
        </span>
        <div className="stl-hero__copy">
          <h1 className="stl-hero__title">Settlement</h1>
          <p className="stl-hero__sub">
            Where funds land, how payments match, and when goods are released.
            Non-custodial — PaymentGate never holds or moves your funds.
          </p>
        </div>
        <GoldWaves id="stl-hero-wave" className="stl-hero__waves" />
        <div className="stl-hero__chips">
          <span className="stl-chip stl-chip--gold">
            <span className="stl-chip__icon" aria-hidden>
              {SETTLEMENT_ICONS.shield}
            </span>
            MFA protected
          </span>
          {lockChip ? <span className="stl-chip">{lockChip}</span> : null}
        </div>
      </div>

      <div className="stl-hero__stats">
        <div className="stl-stat">
          <span className="stl-stat__label">Payout wallets</span>
          <strong className="stl-stat__value">
            <AnimatedText text={addresses.length} />
          </strong>
          <span className="stl-stat__hint">
            {addresses.length === 0
              ? "None set yet"
              : cooling.length > 0
                ? `${cooling.length} in cool-down`
                : "All active"}
          </span>
        </div>
        <div className="stl-stat">
          <span className="stl-stat__label">Matching</span>
          <strong className="stl-stat__value">{matchingModeLabel(matchingMode)}</strong>
          <span className="stl-stat__hint">Mode {matchingMode}</span>
        </div>
        <div className="stl-stat">
          <span className="stl-stat__label">Fulfillment</span>
          <strong className="stl-stat__value">
            {fulfillmentPolicyLabel(fulfillmentPolicy)}
          </strong>
          <span className="stl-stat__hint">When goods are released</span>
        </div>
        <div className="stl-stat">
          <span className="stl-stat__label">Watch-only xPubs</span>
          <strong className="stl-stat__value">
            <AnimatedText text={xpubConfiguredCount} />
          </strong>
          <span className="stl-stat__hint">
            {xpubConfiguredCount > 0 ? "HD pool ready" : "Needed for Smart address"}
          </span>
        </div>
      </div>

      {nextCooldown ? (
        <p
          className="plat-settlement__cooldown-chip stl-hero__cooldown"
          role="status"
          title="New orders still use the active address until cool-down ends."
        >
          <span className="plat-settlement__cooldown-dot" aria-hidden />
          Cool-down ·{" "}
          <code className="mono">
            {truncateAddress(nextCooldown.pendingAddress ?? nextCooldown.address, 6, 4)}
          </code>{" "}
          activates in{" "}
          <strong>{formatCountdown(nextCooldown.pendingActivatesAt) ?? "a moment"}</strong>
        </p>
      ) : null}
    </header>
  );
}
