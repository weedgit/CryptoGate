import { ServiceBillStatus } from "@paymentgate/domain";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { listOrgAccounts } from "../orgs/org-store.mjs";
import { resolveMerchantRatesForBilling } from "../platform-settings/pricing-resolve.mjs";
import { addUsdAmounts } from "./service-bill-rules.mjs";
import {
  defaultDueAt,
  merchantOnboardedInPeriod,
  previousCalendarMonthUtc,
  roundUsd,
  volumeFeeUsd,
} from "./generate-rules.mjs";
import {
  findActiveServiceBillForPeriod,
  insertServiceBill,
  sumCompletedPayableVolume,
} from "./service-bill-store.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";

/**
 * Issue one service bill per active merchant for the period from confirmed volume.
 * Does not debit payer on-chain amounts — USD subscription + volume fee only.
 *
 * Automatic merchants: tier + fee follow the volume schedule for billed volume.
 * Fixed merchants: keep the Owner-locked rate.
 *
 * @param {{
 *   periodStart?: string,
 *   periodEnd?: string,
 *   inclusiveStartIso?: string,
 *   exclusiveEndIso?: string,
 *   actorUserId?: string | null,
 * }} [input]
 */
export async function generateServiceBillsForPeriod(input = {}) {
  const prev = previousCalendarMonthUtc();
  const periodStart = input.periodStart ?? prev.periodStart;
  const periodEnd = input.periodEnd ?? prev.periodEnd;
  const inclusiveStartIso = input.inclusiveStartIso ?? prev.inclusiveStartIso;
  const exclusiveEndIso = input.exclusiveEndIso ?? prev.exclusiveEndIso;
  const dueAt = defaultDueAt(periodEnd);

  const orgs = await listOrgAccounts();
  const merchants = orgs.filter(
    (o) => o.type === "merchant" && o.status !== "paused",
  );

  /** @type {object[]} */
  const issued = [];
  /** @type {{ orgId: string, reason: string }[]} */
  const skipped = [];

  for (const merchant of merchants) {
    const existing = await findActiveServiceBillForPeriod(merchant.id, periodStart);
    if (existing) {
      skipped.push({ orgId: merchant.id, reason: "already_issued" });
      continue;
    }

    if (!merchantOnboardedInPeriod(merchant.created_at, periodEnd)) {
      skipped.push({ orgId: merchant.id, reason: "not_onboarded_in_period" });
      continue;
    }

    const subtree = await listOrgsInSubtree([merchant.id]);
    const volumeOrgIds = subtree
      .filter((r) => r.type === "merchant" || r.type === "merchant_site")
      .map((r) => r.id);
    const volumeRaw = await sumCompletedPayableVolume(
      volumeOrgIds,
      inclusiveStartIso,
      exclusiveEndIso,
    );
    const billedVolumeUsd = roundUsd(volumeRaw);

    const resolved = await resolveMerchantRatesForBilling(
      merchant.id,
      Number(billedVolumeUsd),
    );
    if (!resolved) {
      skipped.push({ orgId: merchant.id, reason: "no_commercial" });
      continue;
    }

    const volumeFeeAmount = volumeFeeUsd(
      billedVolumeUsd,
      resolved.volumeFeePercent,
    );
    const subscriptionAmount = roundUsd(resolved.subscriptionAmountUsd);
    const totalAmount = addUsdAmounts(subscriptionAmount, volumeFeeAmount);

    const row = await insertServiceBill({
      orgId: merchant.id,
      periodStart,
      periodEnd,
      subscriptionAmount,
      volumeFeeAmount,
      totalAmount,
      dueAt,
      status: ServiceBillStatus.Issued,
      tier: resolved.tier,
      volumeFeePercent: String(resolved.volumeFeePercent),
      billedVolumeUsd,
    });
    issued.push(row);
    emitDashboardLive({
      type: "service_bill.issued",
      slices: ["serviceBills"],
      orgId: merchant.id,
    });
  }

  return { periodStart, periodEnd, issued, skipped };
}
