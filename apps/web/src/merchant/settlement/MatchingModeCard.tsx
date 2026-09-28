import { useState, type ReactNode } from "react";
import { isMatchingModeSelectable, MatchingMode } from "@paymentgate/domain";
import { SettlementSectionHead } from "../SettlementSectionHead";
import { ApiError, putMatchingMode } from "../api";
import {
  MATCHING_CONCURRENT_HELP,
  MATCHING_MODE_CARDS,
  matchingModeCardDisabled,
  matchingModeDisabledReason,
  matchingModeLabel,
  matchingModeTooltip,
} from "../matchingLabels";
import { ConfirmChangeDialog } from "./ConfirmChangeDialog";
import { SettlementOptionGroup, type SettlementOption } from "./SettlementOptionGroup";
import type { SettlementNotify } from "./useSettlementData";

type Props = {
  orgId: string;
  mode: string;
  locked: boolean;
  notify: SettlementNotify;
  onSaved: (saved: { matchingMode: string }) => void;
  /** Rendered under the picker while Mode S is the draft. */
  hdPool: ReactNode;
};

const MODE_OPTIONS: SettlementOption[] = MATCHING_MODE_CARDS.map((card) => {
  const unavailable = matchingModeCardDisabled(card.mode);
  return {
    id: card.mode,
    eyebrow: `Mode ${card.mode}`,
    value: card.label,
    hint: card.blurb,
    tip: matchingModeDisabledReason(card.mode) ?? matchingModeTooltip(card.mode),
    tipLabel: `About ${card.label} matching`,
    disabled: unavailable,
    className: unavailable ? "is-unavailable" : undefined,
  };
});

function selectableMode(mode: string): string {
  return isMatchingModeSelectable(mode as MatchingMode) ? mode : "B";
}

export function MatchingModeCard({
  orgId,
  mode,
  locked,
  notify,
  onSaved,
  hdPool,
}: Props) {
  const [draftMode, setDraftMode] = useState(() => selectableMode(mode));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = draftMode !== mode;
  const draftLabel = dirty ? matchingModeLabel(draftMode) : null;

  async function save() {
    setSaving(true);
    try {
      const saved = await putMatchingMode(orgId, draftMode);
      setDraftMode(saved.matchingMode);
      setConfirmOpen(false);
      onSaved({ matchingMode: saved.matchingMode });
      notify.success("Matching mode saved");
    } catch (err) {
      notify.error(err instanceof ApiError ? err.message : "Save matching mode failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="plat-settings__card plat-settlement__card plat-settlement__card--matching">
      <SettlementSectionHead
        icon="match"
        title="Matching mode"
        subtitle="How incoming payments are matched to invoices."
        help={
          <span className="plat-card-help plat-settlement__mode-help">
            <button
              type="button"
              className="plat-card-help__btn"
              aria-label={MATCHING_CONCURRENT_HELP}
            >
              ?
            </button>
            <span className="plat-card-help__tip" role="tooltip">
              {MATCHING_CONCURRENT_HELP}
            </span>
          </span>
        }
      >
        <span className={`plat-settlement__mode-pill${dirty ? " is-stale" : ""}`}>
          {matchingModeLabel(mode)}
        </span>
        {draftLabel ? (
          <span className="plat-settlement__draft-pill">→ {draftLabel}</span>
        ) : null}
      </SettlementSectionHead>
      <div className="plat-settings__card-body">
        <SettlementOptionGroup
          ariaLabel="Matching mode"
          options={MODE_OPTIONS}
          selectedId={draftMode}
          onSelect={setDraftMode}
          locked={locked}
          tipIdPrefix="matching-mode-tip"
        />
        <form className="plat-settlement__form" onSubmit={(e) => e.preventDefault()}>
          {!locked ? (
            <div className="plat-settlement__form-actions">
              <button
                type="button"
                className="btn-primary plat-settings__submit"
                disabled={!dirty || saving}
                onClick={() => setConfirmOpen(true)}
              >
                Save matching mode
              </button>
            </div>
          ) : null}
        </form>

        {draftMode === "S" ? hdPool : null}
      </div>

      {confirmOpen ? (
        <ConfirmChangeDialog
          titleId="merchant-settlement-confirm-title"
          title="Confirm matching mode"
          busy={saving}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void save()}
        >
          Switch to <strong>{matchingModeLabel(draftMode)}</strong>? Applies to{" "}
          <strong>new orders only</strong>. Open orders keep their create-time mode.
        </ConfirmChangeDialog>
      ) : null}
    </section>
  );
}
