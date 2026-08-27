import { ServiceBillStatus } from "@cryptogate/domain";
import { findMerchantCommercial } from "../commercial/merchant-commercial-store.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { listOrgAccounts } from "../orgs/org-store.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";
import { addUsdAmounts } from "./service-bill-rules.mjs";
import {
  defaultDueAt,
  previousCalendarMonthUtc,
  roundUsd,
  volumeFeeUsd,
} from "./generate-rules.mjs";
import {
  findActiveServiceBillForPeriod,
  insertServiceBill,
  sumCompletedPayableVolume,
} from "./service-bill-store.mjs";

/**
 * Issue one service bill per active merchant for the period from confirmed volume.
 * Does not debit payer on-chain amounts — USD subscription + volume fee only.
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

    const commercial = await findMerchantCommercial(merchant.id);
    if (!commercial) {
      skipped.push({ orgId: merchant.id, reason: "no_commercial" });
      continue;
    }

    const band = await findFeeTierBand(commercial.tier);
    if (!band) {
      skipped.push({ orgId: merchant.id, reason: "no_fee_tier" });
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
    const volumeFeeAmount = volumeFeeUsd(
      roundUsd(volumeRaw),
      commercial.volume_fee_percent,
    );
    const subscriptionAmount = roundUsd(band.subscription_amount_usd);
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
    });
    issued.push(row);
  }

  return { periodStart, periodEnd, issued, skipped };
}
