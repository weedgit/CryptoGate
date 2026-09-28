import { useState } from "react";
import { SettlementSectionHead } from "../SettlementSectionHead";
import { ApiError, putFulfillmentPolicy } from "../api";
import {
  FULFILLMENT_POLICY_CARDS,
  fulfillmentPolicyLabel,
  fulfillmentPolicyScope,
  fulfillmentPolicyTooltip,
} from "../fulfillmentLabels";
import { ConfirmChangeDialog } from "./ConfirmChangeDialog";
import { SettlementOptionGroup, type SettlementOption } from "./SettlementOptionGroup";
import type { SettlementNotify } from "./useSettlementData";

type Props = {
  orgId: string;
  policy: string;
  locked: boolean;
  notify: SettlementNotify;
  onSaved: (policy: string) => void;
};

/** Policies that release goods before confirmations finish need an explicit confirm. */
const CONFIRM_POLICY = "on_verifying";

const POLICY_OPTIONS: SettlementOption[] = FULFILLMENT_POLICY_CARDS.map((card) => ({
  id: card.policy,
  eyebrow: "Policy",
  value: card.label,
  hint: card.blurb,
  tip: fulfillmentPolicyTooltip(card.policy),
  tipLabel: `About ${card.label} fulfillment`,
}));

export function FulfillmentPolicyCard({ orgId, policy, locked, notify, onSaved }: Props) {
  const [draft, setDraft] = useState(policy);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== policy;

  async function save() {
    setSaving(true);
    try {
      const saved = await putFulfillmentPolicy(orgId, draft);
      setDraft(saved.fulfillmentPolicy);
      setConfirmOpen(false);
      onSaved(saved.fulfillmentPolicy);
      notify.success("Fulfillment policy saved");
    } catch (err) {
      notify.error(err instanceof ApiError ? err.message : "Save fulfillment policy failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="plat-settings__card plat-settlement__card plat-settlement__card--fulfillment">
      <SettlementSectionHead
        icon="release"
        title="Fulfillment policy"
        subtitle="When staff can hand over goods."
      >
        <span className={`plat-settlement__mode-pill${dirty ? " is-stale" : ""}`}>
          {fulfillmentPolicyLabel(policy)}
        </span>
        {dirty ? (
          <span className="plat-settlement__draft-pill">
            → {fulfillmentPolicyLabel(draft)}
          </span>
        ) : null}
      </SettlementSectionHead>
      <div className="plat-settings__card-body">
        <p className="plat-settings__card-copy">{fulfillmentPolicyScope(policy)}</p>
        <SettlementOptionGroup
          ariaLabel="Fulfillment policy"
          options={POLICY_OPTIONS}
          selectedId={draft}
          onSelect={setDraft}
          duo
          locked={locked}
          tipIdPrefix="fulfillment-policy-tip"
        />
        {!locked ? (
          <div className="plat-settlement__form">
            <div className="plat-settlement__form-actions">
              <button
                type="button"
                className="btn-primary plat-settings__submit"
                disabled={!dirty || saving}
                onClick={() => {
                  if (draft === CONFIRM_POLICY) setConfirmOpen(true);
                  else void save();
                }}
              >
                Save fulfillment policy
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {confirmOpen ? (
        <ConfirmChangeDialog
          titleId="merchant-fulfillment-confirm-title"
          title="Confirm Counter policy"
          busy={saving}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void save()}
        >
          Switch to <strong>Counter (release on verifying)</strong>? Staff may release goods
          when a tx is detected, before confirmations complete. Applies to{" "}
          <strong>new orders only</strong>.
        </ConfirmChangeDialog>
      ) : null}
    </section>
  );
}
