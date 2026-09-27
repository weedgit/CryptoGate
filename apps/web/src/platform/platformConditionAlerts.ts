import { getCommissionPayoutsSummary } from "../shared/commissionsServer";
import { createConditionAlertGroup } from "../shared/conditionAlerts";
import { platformRoute } from "../shared/portalRouting";
import type { AlertItem } from "./ui/AlertsDrawer";
import type { Session } from "./api";
import { sessionIsPlatformStaff } from "./org";

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

/** Recompute platform condition alerts (stuck commissions). */
export async function refreshPlatformConditionAlerts(session: Session): Promise<void> {
  if (!sessionIsPlatformStaff(session)) {
    publish([]);
    return;
  }
  const summary = await getCommissionPayoutsSummary().catch(() => null);
  const items: AlertItem[] = [];
  if (summary && summary.stuckPaid > 0) items.push(stuckCommissionsAlert(summary.stuckPaid));
  publish(items);
}
