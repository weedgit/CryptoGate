import { useMemo, useState } from "react";
import { AuthToast } from "../auth/AuthToast";
import { PagePending } from "../platform/ui/PlatformPending";
import { PricingSettingsPage } from "./PricingSettingsPage";
import type { Session } from "./api";
import {
  primaryMerchantOrgId,
  sessionCanEditSettlement,
  sessionCanManageSettlementOps,
} from "./org";
import { CashierChannelCard } from "./settlement/CashierChannelCard";
import { FulfillmentPolicyCard } from "./settlement/FulfillmentPolicyCard";
import { HdPoolPanel } from "./settlement/HdPoolPanel";
import { MatchingModeCard } from "./settlement/MatchingModeCard";
import { SettlementAddressesCard } from "./settlement/SettlementAddressesCard";
import { SettlementHero } from "./settlement/SettlementHero";
import { useSettlementData, type SettlementNotify } from "./settlement/useSettlementData";

type Props = {
  session: Session;
  onSessionRefresh?: (session: Session) => void;
};

export function SettlementPage({ session, onSessionRefresh }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const notify = useMemo<SettlementNotify>(
    () => ({
      error: (message) => {
        setSuccess(null);
        setError(message);
      },
      success: (message) => {
        setError(null);
        setSuccess(message);
      },
      clear: () => {
        setError(null);
        setSuccess(null);
      },
    }),
    [],
  );
  const { data, loading, forbidden, patch, reloadAddresses, reloadXpubAndPool } =
    useSettlementData(orgId, notify);

  const canEditWallets = useMemo(() => sessionCanEditSettlement(session), [session]);
  const canManageOps = useMemo(() => sessionCanManageSettlementOps(session), [session]);
  const matchingInherited = data.matchingSource === "inherit";
  const fulfillmentInherited = data.fulfillmentSource === "inherit";
  const walletsLocked = matchingInherited || !canEditWallets;
  const matchingLocked = matchingInherited || !canManageOps;
  const fulfillmentLocked = fulfillmentInherited || !canManageOps;
  const lockChip =
    matchingInherited || fulfillmentInherited
      ? "Inherited"
      : !canManageOps
        ? "View only"
        : !canEditWallets
          ? "Wallets: Owner only"
          : null;

  const toast = (
    <AuthToast
      message={error ?? success}
      tone={error ? "error" : "ok"}
      onDismiss={notify.clear}
    />
  );

  if (loading) {
    return <PagePending />;
  }

  if (forbidden || !orgId) {
    return (
      <div className="plat-settings plat-settings--merchant plat-settlement">
        {toast}
        <section className="plat-settings__card plat-settlement__card">
          <div className="plat-settings__card-head stl-head">
            <h2 className="plat-settings__card-title">Settlement</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="muted">You do not have access to settlement settings.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="plat-settings plat-settings--merchant plat-settlement">
      {toast}

      <SettlementHero addresses={data.addresses} lockChip={lockChip} />

      {matchingInherited || fulfillmentInherited ? (
        <p className="plat-settings__notice" role="status">
          Inheriting billing merchant defaults. This site has no wallet of its own —
          settlement, matching, fulfillment, and retention come from the parent merchant.
          Change those on the merchant account.
        </p>
      ) : null}

      <div className="plat-settlement__layout plat-settlement__layout--cols">
        <div className="plat-settlement__col">
          <SettlementAddressesCard
            orgId={orgId}
            session={session}
            addresses={data.addresses}
            locked={walletsLocked}
            notify={notify}
            reloadAddresses={reloadAddresses}
            onSessionRefresh={onSessionRefresh}
          />

          <FulfillmentPolicyCard
            orgId={orgId}
            policy={data.fulfillmentPolicy}
            locked={fulfillmentLocked}
            notify={notify}
            onSaved={(policy) => patch({ fulfillmentPolicy: policy })}
          />

          <CashierChannelCard orgId={orgId} canManage={canManageOps} notify={notify} />
        </div>

        <div className="plat-settlement__col">
          <PricingSettingsPage session={session} />

          <MatchingModeCard
            orgId={orgId}
            mode={data.matchingMode}
            locked={matchingLocked}
            notify={notify}
            onSaved={(saved) => patch({ matchingMode: saved.matchingMode })}
            hdPool={
              <HdPoolPanel
                orgId={orgId}
                session={session}
                xpubs={data.xpubs}
                pool={data.pool}
                derivePath={data.derivePath}
                locked={walletsLocked}
                notify={notify}
                reloadXpubAndPool={reloadXpubAndPool}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
