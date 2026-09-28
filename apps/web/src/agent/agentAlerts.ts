import {
  missingSetupPartsLabel,
  sessionNeedsOrgSetup,
  setupAlertHref,
} from "../auth/contactVerification";
import type { AlertItem } from "../platform/ui/AlertsDrawer";
import { formatShortTime } from "../merchant/orderStatus";
import { formatCountdown } from "../merchant/org";
import { getCommissionPayoutsSummary } from "../shared/commissionsServer";
import { createConditionAlertGroup } from "../shared/conditionAlerts";
import { agentRoute } from "../shared/portalRouting";
import { ORG_EDIT_PARAM, withEditParam } from "../shared/modalLinks";
import { getAgentPayout, type Session } from "./api";
import { agentInAppEnabled, loadAgentNotificationPrefs } from "./agentNotificationPrefs";
import { primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";

const publish = createConditionAlertGroup();

export function clearAgentAlerts(): void {
  lastSession = null;
  publish([]);
}

function setupAlert(orgId: string, session: Session): AlertItem {
  return {
    id: `agent:setup:${orgId}`,
    category: "security",
    title: "Finish account setup",
    body: `Watch-only until setup is complete. You can look around; finish ${missingSetupPartsLabel(session, "agent")} to unlock live actions.`,
    at: "Now",
    href: setupAlertHref("agent"),
    hrefLabel: "Finish setup",
    tone: "warn",
    urgent: true,
    unresolved: true,
    actionable: true,
  };
}

function payoutPendingAlert(orgId: string, activatesAt: string): AlertItem {
  const remaining = formatCountdown(activatesAt);
  return {
    id: `agent:payout:cooldown:${orgId}`,
    category: "security",
    title: "Payout wallet change pending",
    body: remaining
      ? `New commission payout wallet activates in ${remaining}. Until then, payouts still go to the current wallet.`
      : `New commission payout wallet activates ${formatShortTime(activatesAt)}. Until then, payouts still go to the current wallet.`,
    at: formatShortTime(activatesAt),
    href: withEditParam(agentRoute(), ORG_EDIT_PARAM),
    hrefLabel: "Settings",
    tone: "warn",
    urgent: false,
    unresolved: true,
    actionable: false,
    waiting: true,
  };
}

function stuckCommissionsAlert(
  orgId: string,
  count: number,
  canConfirm: boolean,
): AlertItem {
  const invoices = count === 1 ? "1 paid commission invoice has" : `${count} paid commission invoices have`;
  return {
    id: `agent:commissions:stuck:${orgId}`,
    category: "billing",
    title: "Confirm commission receipt",
    body: canConfirm
      ? `${invoices} awaited your confirmation for 7+ days. Check the payout wallet, then Confirm receipt.`
      : `${invoices} awaited confirmation for 7+ days. An Owner or Administrator must Confirm receipt.`,
    at: "7+ days",
    href: `${agentRoute("commissions")}?status=paid`,
    hrefLabel: "Open Awaiting",
    tone: "warn",
    urgent: true,
    unresolved: true,
    actionable: canConfirm,
  };
}

let lastSession: Session | null = null;

/** Re-run with the last session (e.g. after notification prefs change). */
export function rerunAgentAlerts(): void {
  if (lastSession) void refreshAgentAlerts(lastSession);
}

/** Recompute agent condition alerts (setup, payout cool-down, stuck commissions). */
export async function refreshAgentAlerts(session: Session): Promise<void> {
  lastSession = session;
  const orgId = primaryAgentOrgId(session);
  if (!orgId) {
    publish([]);
    return;
  }
  const items: AlertItem[] = [];
  if (sessionNeedsOrgSetup(session)) items.push(setupAlert(orgId, session));

  const [payout, summary, prefs] = await Promise.all([
    getAgentPayout(orgId).catch(() => null),
    getCommissionPayoutsSummary({ payeeOrgId: orgId }).catch(() => null),
    loadAgentNotificationPrefs(orgId).catch(() => null),
  ]);
  if (payout?.pendingActivatesAt && agentInAppEnabled(prefs, "payout_wallet")) {
    items.push(payoutPendingAlert(orgId, payout.pendingActivatesAt));
  }
  if (summary && summary.stuckPaid > 0 && agentInAppEnabled(prefs, "commission_paid")) {
    items.push(
      stuckCommissionsAlert(orgId, summary.stuckPaid, sessionCanOnboardMerchant(session)),
    );
  }
  publish(items);
}
