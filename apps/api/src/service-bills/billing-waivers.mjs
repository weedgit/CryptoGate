import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import { consumeFeeWaiverMonth } from "./billing-waiver-store.mjs";
import { feeWaiverCloseReason } from "./billing-waiver-rules.mjs";
import { waiveServiceBill } from "./service-bill-store.mjs";

/**
 * Monthly bill for a merchant on the waive-platform-fee list: keep the real
 * amounts, save as waived with "Waived N of M — reason", count the month down.
 * @param {object} row freshly inserted draft bill
 * @param {{ org_id: string, months_used: number, months_granted: number, reason: string }} waiver
 */
export async function closeMonthlyBillAsWaived(row, waiver) {
  const waived = (await waiveServiceBill(row.id, feeWaiverCloseReason(waiver))) ?? row;
  await consumeFeeWaiverMonth(waiver.org_id);
  emitDashboardLive({
    type: "service_bill.waived",
    slices: ["serviceBills"],
    orgId: waiver.org_id,
  });
  return waived;
}
