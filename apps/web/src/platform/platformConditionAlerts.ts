import { getCommissionPayoutsSummary } from "../shared/commissionsServer";
import { createConditionAlertGroup } from "../shared/conditionAlerts";
import { formatShortTime } from "../merchant/orderStatus";
import { platformRoute } from "../shared/portalRouting";
import type { AlertItem } from "./ui/AlertsDrawer";
import {
  listEnterpriseRateApprovals,
  type EnterpriseRateApproval,
  type Session,
} from "./api";
import { sessionIsPlatformOwner, sessionIsPlatformStaff } from "./org";

const publish = createConditionAlertGroup();

export function clearPlatformConditionAlerts(): void {
  publish([]);
}

function stuckCommissionsAlert(count: number): AlertItem {
  return {
    id: "platform:commissions:stuck",
    category: "billing",
    title: "Commissions awaiting agent confirm",
    body:
      count === 1
        ? "1 paid commission invoice has awaited agent confirmation for 7+ days. Follow up with the agent if the payout did not arrive."
        : `${count} paid commission invoices have awaited agent confirmation for 7+ days. Follow up with the agents if payouts did not arrive.`,
    at: "7+ days",
    href: `${platformRoute("commissions")}?status=paid`,
    hrefLabel: "Open Awaiting",
    tone: "info",
    urgent: false,
    unresolved: true,
    actionable: false,
    waiting: true,
  };
}

function enterpriseReviewAlert(row: EnterpriseRateApproval): AlertItem {
  const name = row.merchantName?.trim() || "A merchant";
  return {
    id: `platform:enterprise:${row.id}`,
    category: "billing",
    title: "Enterprise rate needs review",
    body: `${name} requested Enterprise at ${row.requestedVolumeFeePercent}% volume fee. Only the platform Owner can approve or deny.`,
    at: formatShortTime(row.createdAt),
    href: platformRoute(`accounts/${encodeURIComponent(row.orgId)}`),
    hrefLabel: "Open merchant",
    tone: "warn",
    urgent: true,
    unresolved: true,
    actionable: true,
  };
}

/** Recompute platform condition alerts (stuck commissions, Enterprise reviews for Owner). */
export async function refreshPlatformConditionAlerts(session: Session): Promise<void> {
  if (!sessionIsPlatformStaff(session)) {
    publish([]);
    return;
  }
  const owner = sessionIsPlatformOwner(session);
  const [summary, approvals] = await Promise.all([
    getCommissionPayoutsSummary().catch(() => null),
    owner ? listEnterpriseRateApprovals("pending").catch(() => []) : Promise.resolve([]),
  ]);
  const items: AlertItem[] = [];
  if (summary && summary.stuckPaid > 0) items.push(stuckCommissionsAlert(summary.stuckPaid));
  for (const row of approvals) items.push(enterpriseReviewAlert(row));
  publish(items);
}
