import { MerchantSettlementPanel } from "../../platform/MerchantSettlementPanel";
import { getSession, type Session, type SettlementAddress } from "../api";
import type { SettlementNotify } from "./useSettlementData";

type Props = {
  orgId: string;
  session: Session;
  addresses: SettlementAddress[];
  locked: boolean;
  notify: SettlementNotify;
  reloadAddresses: () => Promise<void>;
  onSessionRefresh?: (session: Session) => void;
};

export function SettlementAddressesCard({
  orgId,
  session,
  addresses,
  locked,
  notify,
  reloadAddresses,
  onSessionRefresh,
}: Props) {
  async function onSaved() {
    notify.success("Settlement address saved — cool-down may apply");
    if (onSessionRefresh) {
      try {
        onSessionRefresh(await getSession());
      } catch {
        /* ignore */
      }
    }
    try {
      await reloadAddresses();
    } catch {
      notify.error("Address saved, but the list could not refresh — reload the page.");
    }
  }

  return (
    <section className="plat-settlement__card--addresses plat-settlement__wallets platform-detail b3-agent-detail">
      <MerchantSettlementPanel
        orgId={orgId}
        session={session}
        canManage={!locked}
        settlement={addresses}
        loading={false}
        onSettlementChange={() => undefined}
        onSaved={() => void onSaved()}
      />
    </section>
  );
}
