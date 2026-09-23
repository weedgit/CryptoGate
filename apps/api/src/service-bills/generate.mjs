import { ServiceBillKind, ServiceBillStatus } from "@paymentgate/domain";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { listOrgAccounts } from "../orgs/org-store.mjs";
import {
  findMerchantCommercial,
  consumeMerchantServiceBillCredit,
} from "../commercial/merchant-commercial-store.mjs";
import { resolveMerchantRatesForBilling } from "../platform-settings/pricing-resolve.mjs";
import { getBillingCalendarSettings } from "../platform-settings/billing-calendar-store.mjs";
import { merchantPayDueAtForPeriod } from "../platform-settings/billing-calendar-rules.mjs";
import { addUsdAmounts } from "./service-bill-rules.mjs";
import {
  merchantOnboardedInPeriod,
  previousCalendarMonthUtc,
  roundUsd,
  volumeFeeUsd,
} from "./generate-rules.mjs";
import {
  adjustServiceBillLines,
  findActiveServiceBillForPeriod,
  insertServiceBill,
  sendServiceBill,
  sumCompletedPayableVolume,
} from "./service-bill-store.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";

/**
 * Draft (or auto-send) one service bill per active merchant for the period.
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
  const calendar = await getBillingCalendarSettings();
  const dueAt = merchantPayDueAtForPeriod(
    periodEnd,
    calendar.merchantPayDayEnd,
  );

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

    const commercialRow = await findMerchantCommercial(merchant.id);
    if (commercialRow?.fee_exempt_until) {
      const until =
        commercialRow.fee_exempt_until instanceof Date
          ? commercialRow.fee_exempt_until.toISOString().slice(0, 10)
          : String(commercialRow.fee_exempt_until).slice(0, 10);
      if (until >= periodEnd) {
        skipped.push({ orgId: merchant.id, reason: "fee_exempt" });
        continue;
      }
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
    let totalAmount = addUsdAmounts(subscriptionAmount, volumeFeeAmount);

    const credit = await consumeMerchantServiceBillCredit(merchant.id, totalAmount);
    totalAmount = credit.newTotal;
    const creditAppliedUsd =
      credit.creditApplied !== "0.00" ? credit.creditApplied : null;

    const initialStatus = calendar.autoSendInvoices
      ? ServiceBillStatus.Issued
      : ServiceBillStatus.Draft;

    let row = await insertServiceBill({
      orgId: merchant.id,
      periodStart,
      periodEnd,
      subscriptionAmount,
      volumeFeeAmount,
      totalAmount,
      dueAt,
      status: initialStatus,
      tier: resolved.tier,
      volumeFeePercent: String(resolved.volumeFeePercent),
      billedVolumeUsd,
      billKind: ServiceBillKind.Monthly,
      sentAt: calendar.autoSendInvoices ? new Date().toISOString() : null,
    });

    if (creditAppliedUsd) {
      row =
        (await adjustServiceBillLines(row.id, {
          subscriptionAmount,
          volumeFeeAmount,
          totalAmount,
          reason: "Applied merchant service-bill credit",
          adjustmentAmount: `-${creditAppliedUsd}`,
          creditAppliedUsd,
        })) ?? row;
    }

    if (calendar.autoSendInvoices && row.status === ServiceBillStatus.Draft) {
      row = (await sendServiceBill(row.id, dueAt)) ?? row;
    }

    issued.push(row);
    emitDashboardLive({
      type: calendar.autoSendInvoices
        ? "service_bill.issued"
        : "service_bill.draft",
      slices: ["serviceBills"],
      orgId: merchant.id,
    });
  }

  return { periodStart, periodEnd, issued, skipped };
}
