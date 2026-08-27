import { upsertMatchingModeSettings } from "../matching-mode/matching-mode-store.mjs";
import { upsertRetentionSettings } from "../retention/retention-store.mjs";
import { settlementCooldownMs } from "../settlement/settlement-rules.mjs";
import { upsertSettlementAddress } from "../settlement/settlement-store.mjs";
import { xpubCooldownMs } from "../xpub/xpub-rules.mjs";
import { upsertXpub } from "../xpub/xpub-store.mjs";

/**
 * Apply an approved override payload onto the site org tables.
 * @param {{ siteOrgId: string, settingKind: string, payload: object }} row
 */
export async function applyApprovedOverride(row) {
  const orgId = row.siteOrgId ?? row.site_org_id;
  const kind = row.settingKind ?? row.setting_kind;
  const payload = row.payload ?? {};

  if (kind === "matching_mode") {
    await upsertMatchingModeSettings({
      orgId,
      matchingMode: payload.matchingMode,
    });
    return;
  }
  if (kind === "order_retention") {
    await upsertRetentionSettings({
      orgId,
      orderDeleteDays: payload.orderDeleteDays,
    });
    return;
  }
  if (kind === "settlement") {
    await upsertSettlementAddress({
      orgId,
      asset: payload.asset,
      network: payload.network,
      address: payload.address,
      cooldownMs: settlementCooldownMs(),
    });
    return;
  }
  if (kind === "xpub") {
    await upsertXpub({
      orgId,
      asset: payload.asset,
      network: payload.network,
      xPub: payload.xPub,
      cooldownMs: xpubCooldownMs(),
    });
  }
}
