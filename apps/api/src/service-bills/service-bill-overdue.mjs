import { ServiceBillStatus } from "@paymentgate/domain";
import { getPool } from "../db/pool.mjs";
import { updateOrgStatus } from "../orgs/org-store.mjs";
import {
  AgentNotificationEventType,
  notifyAgentOfOrg,
  notifyServiceBillOverdue,
} from "../notifications/notify.mjs";

/**
 * Transition issued bills past due_at to overdue and pause merchants.
 * @returns {Promise<{ count: number, orgIds: string[], pausedOrgIds: string[] }>}
 */
export async function markOverdueServiceBills(now = new Date()) {
  const { rows } = await getPool().query(
    `UPDATE service_bills
     SET status = $1, updated_at = now()
     WHERE status = $2
       AND due_at < $3::timestamptz
     RETURNING id, org_id, total_amount, currency`,
    [ServiceBillStatus.Overdue, ServiceBillStatus.Issued, now.toISOString()],
  );

  /** @type {string[]} */
  const pausedOrgIds = [];
  for (const row of rows) {
    const orgId = String(row.org_id);
    const billId = String(row.id);
    try {
      const updated = await updateOrgStatus(orgId, "paused", {
        reason: "Unpaid service bill",
        reasonBillId: billId,
      });
      if (updated && updated.status === "paused") {
        pausedOrgIds.push(orgId);
      }
    } catch {
      /* ignore pause failures so overdue still applies */
    }
    notifyServiceBillOverdue({ ...row, id: billId, org_id: orgId });
    notifyAgentOfOrg(
      orgId,
      AgentNotificationEventType.MerchantBillOverdue,
      (merchantName) => ({
        subject: `Service bill overdue — ${merchantName}`,
        lines: [
          `A service bill for ${merchantName} (${row.total_amount} ${row.currency ?? "USD"}) is now overdue.`,
          "The merchant's payments are paused until it is paid.",
        ],
        path: "service-bills",
      }),
    );
  }

  const orgIds = [...new Set(rows.map((r) => String(r.org_id)))];
  return { count: rows.length, orgIds, pausedOrgIds };
}
