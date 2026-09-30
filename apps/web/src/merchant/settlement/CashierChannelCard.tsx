import { useEffect, useState } from "react";
import { ChartHelpButton } from "../../platform/ui/ChartHelpButton";
import { SettlementSectionHead } from "../SettlementSectionHead";
import { SETTLEMENT_HELP } from "./settlementHelp";
import { ApiError, getPosSettings, putPosSettings, type PosSettings } from "../api";
import { SettlementOptionGroup, type SettlementOption } from "./SettlementOptionGroup";
import type { SettlementNotify } from "./useSettlementData";

type Props = {
  orgId: string;
  canManage: boolean;
  notify: SettlementNotify;
};

const WEB_AND_POS = "web_and_pos";
const POS_ONLY = "pos_only";

const OPTIONS: SettlementOption[] = [
  {
    id: WEB_AND_POS,
    eyebrow: "Cashiers",
    value: "Web + POS app",
    hint: "Cashiers can charge from the web terminal or the POS app.",
    tip: SETTLEMENT_HELP.cashierWebAndPos,
    tipLabel: "About Web + POS app",
  },
  {
    id: POS_ONLY,
    eyebrow: "Cashiers",
    value: "POS app only",
    hint: "The web terminal shows My shift and Orders; charging happens in the POS app.",
    tip: SETTLEMENT_HELP.cashierPosOnly,
    tipLabel: "About POS app only",
  },
];

function optionFor(allowed: boolean): string {
  return allowed ? WEB_AND_POS : POS_ONLY;
}

/** Merchant policy: may cashiers create orders on the web? Sites inherit it. */
export function CashierChannelCard({ orgId, canManage, notify }: Props) {
  const [settings, setSettings] = useState<PosSettings | null>(null);
  const [draft, setDraft] = useState(WEB_AND_POS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPosSettings(orgId)
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setDraft(optionFor(s.cashierWebOrders));
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!settings) return null;

  const inherited = settings.source === "inherit";
  const locked = inherited || !canManage;
  const current = optionFor(settings.cashierWebOrders);
  const dirty = draft !== current;

  async function save() {
    setSaving(true);
    try {
      const saved = await putPosSettings(orgId, draft === WEB_AND_POS);
      setSettings(saved);
      setDraft(optionFor(saved.cashierWebOrders));
      notify.success("Cashier channel saved");
    } catch (err) {
      notify.error(err instanceof ApiError ? err.message : "Save cashier channel failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="plat-settings__card plat-settlement__card plat-settlement__card--cashier-channel">
      <SettlementSectionHead
        icon="terminal"
        title="Cashier channel"
        subtitle="Where cashiers create orders."
        help={
          <ChartHelpButton
            openOnHover
            label="About cashier channel"
            text={SETTLEMENT_HELP.cashierChannel}
          />
        }
      >
        <span className={`plat-settlement__mode-pill${dirty ? " is-stale" : ""}`}>
          {settings.cashierWebOrders ? "Web + POS app" : "POS app only"}
        </span>
        {inherited ? <span className="plat-settlement__draft-pill">Inherited</span> : null}
      </SettlementSectionHead>
      <div className="plat-settings__card-body">
        <p className="plat-settings__card-copy">
          {inherited
            ? "Set on the parent merchant and applies to this site."
            : "Applies to this merchant and all of its sites. Owners and admins can always charge on the web."}
        </p>
        <SettlementOptionGroup
          ariaLabel="Cashier channel"
          options={OPTIONS}
          selectedId={draft}
          onSelect={setDraft}
          duo
          locked={locked}
          tipIdPrefix="cashier-channel-tip"
        />
        {!locked ? (
          <div className="plat-settlement__form">
            <div className="plat-settlement__form-actions">
              <button
                type="button"
                className="btn-primary plat-settings__submit"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                Save cashier channel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
