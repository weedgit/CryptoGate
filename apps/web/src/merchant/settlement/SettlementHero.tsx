import { ChartHelpButton } from "../../platform/ui/ChartHelpButton";
import { SETTLEMENT_ICONS } from "../SettlementSectionHead";
import { SETTLEMENT_HELP } from "./settlementHelp";
import { formatCountdown, truncateAddress } from "../org";
import type { SettlementAddress } from "../api";

type Props = {
  addresses: SettlementAddress[];
  lockChip: string | null;
};

export function SettlementHero({ addresses, lockChip }: Props) {
  const nextCooldown = addresses.find((a) => a.status === "pending_cool_down");

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
        <div className="stl-hero__chips">
          <span className="stl-chip stl-chip--gold">
            <span className="stl-chip__icon" aria-hidden>
              {SETTLEMENT_ICONS.shield}
            </span>
            MFA protected
            <ChartHelpButton openOnHover label="About MFA protection" text={SETTLEMENT_HELP.mfa} />
          </span>
          {lockChip ? <span className="stl-chip">{lockChip}</span> : null}
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
