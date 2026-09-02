import { upsertMatchingModeSettings } from "../matching-mode/matching-mode-store.mjs";
import { upsertFulfillmentPolicySettings } from "../fulfillment-policy/fulfillment-policy-store.mjs";
import { upsertRetentionSettings } from "../retention/retention-store.mjs";

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
  if (kind === "fulfillment_policy") {
    await upsertFulfillmentPolicySettings({
      orgId,
      fulfillmentPolicy: payload.fulfillmentPolicy,
    });
    return;
  }
  if (kind === "order_retention") {
    await upsertRetentionSettings({
      orgId,
      orderDeleteDays: payload.orderDeleteDays,
    });
  }
}
