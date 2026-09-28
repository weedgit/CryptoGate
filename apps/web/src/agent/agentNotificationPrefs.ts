import {
  getNotificationPreferences,
  putNotificationPreferences,
  type NotificationPreference,
  type NotificationPreferenceList,
} from "../merchant/api";
import type { AlertIconKind } from "../shared/AlertSettingsPage";

export type AgentNotificationEvent =
  | "commission_paid"
  | "payout_wallet"
  | "merchant_onboarded"
  | "merchant_bill_overdue"
  | "merchant_payment_anomaly"
  | "team_member_joined";

export const AGENT_NOTIFICATION_META: {
  eventType: AgentNotificationEvent;
  label: string;
  blurb: string;
  icon: AlertIconKind;
  /** Has an in-app alert in the Alerts drawer. */
  inApp: boolean;
}[] = [
  {
    eventType: "commission_paid",
    icon: "commission",
    label: "Commission paid",
    blurb: "A commission payout was sent and needs your receipt confirmation.",
    inApp: true,
  },
  {
    eventType: "payout_wallet",
    icon: "wallet",
    label: "Payout wallet change",
    blurb: "Your commission payout wallet was set or a change is pending.",
    inApp: true,
  },
  {
    eventType: "merchant_onboarded",
    icon: "org",
    label: "Merchant onboarded",
    blurb: "A new merchant was created under your agent account.",
    inApp: false,
  },
  {
    eventType: "merchant_bill_overdue",
    icon: "bill",
    label: "Merchant bill overdue",
    blurb: "One of your merchants has an overdue service bill and is paused.",
    inApp: false,
  },
  {
    eventType: "merchant_payment_anomaly",
    icon: "anomaly",
    label: "Merchant payment anomaly",
    blurb: "An order on one of your merchants needs attention.",
    inApp: false,
  },
  {
    eventType: "team_member_joined",
    icon: "team",
    label: "New team member",
    blurb: "Someone was added to your agent team.",
    inApp: false,
  },
];

type Cached = { orgId: string; data: NotificationPreferenceList };

let cached: Cached | null = null;
let inflight: { orgId: string; promise: Promise<NotificationPreferenceList> } | null = null;

export function peekAgentNotificationPrefs(orgId: string): NotificationPreferenceList | null {
  return cached?.orgId === orgId ? cached.data : null;
}

export async function loadAgentNotificationPrefs(
  orgId: string,
  opts: { force?: boolean } = {},
): Promise<NotificationPreferenceList> {
  if (!opts.force && cached?.orgId === orgId) return cached.data;
  if (inflight?.orgId === orgId) return inflight.promise;
  const promise = getNotificationPreferences(orgId)
    .then((data) => {
      cached = { orgId, data };
      return data;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { orgId, promise };
  return promise;
}

export async function saveAgentNotificationPrefs(
  orgId: string,
  items: NotificationPreference[],
): Promise<NotificationPreferenceList> {
  const data = await putNotificationPreferences(orgId, items);
  cached = { orgId, data };
  return data;
}

/** In-app alert allowed for this event (defaults on until prefs load). */
export function agentInAppEnabled(
  prefs: NotificationPreferenceList | null,
  eventType: AgentNotificationEvent,
): boolean {
  const row = prefs?.items.find((r) => r.eventType === eventType);
  return row ? row.inApp : true;
}
