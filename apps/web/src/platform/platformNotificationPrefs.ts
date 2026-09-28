import {
  getNotificationPreferences,
  putNotificationPreferences,
  type NotificationPreference,
  type NotificationPreferenceList,
} from "../merchant/api";
import type { AlertIconKind } from "../shared/AlertSettingsPage";
import type { Session } from "./api";

export type PlatformNotificationEvent =
  | "platform_bill_overdue"
  | "platform_payment_anomaly"
  | "platform_account_created"
  | "platform_team_member_joined"
  | "platform_system_health"
  | "platform_commission_stuck";

export const PLATFORM_NOTIFICATION_META: {
  eventType: PlatformNotificationEvent;
  label: string;
  blurb: string;
  icon: AlertIconKind;
  email: boolean;
  inApp: boolean;
}[] = [
  {
    eventType: "platform_bill_overdue",
    icon: "bill",
    label: "Merchant bill overdue",
    blurb: "A merchant service bill passed its due date and the merchant is paused.",
    email: true,
    inApp: false,
  },
  {
    eventType: "platform_payment_anomaly",
    icon: "anomaly",
    label: "Payment anomaly",
    blurb: "Underpay, overpay, collision, or wrong-network on any merchant order.",
    email: true,
    inApp: false,
  },
  {
    eventType: "platform_account_created",
    icon: "org",
    label: "New merchant / agent account",
    blurb: "A merchant or agent organization was created by someone else.",
    email: true,
    inApp: false,
  },
  {
    eventType: "platform_team_member_joined",
    icon: "team",
    label: "New team member",
    blurb: "Someone was added to the platform team.",
    email: true,
    inApp: false,
  },
  {
    eventType: "platform_system_health",
    icon: "health",
    label: "System health",
    blurb: "API, database, or webhook worker health checks fail.",
    email: false,
    inApp: true,
  },
  {
    eventType: "platform_commission_stuck",
    icon: "commission",
    label: "Commissions awaiting confirm",
    blurb: "Paid commission invoices waiting 7+ days for agent confirmation.",
    email: false,
    inApp: true,
  },
];

export function primaryPlatformOrgId(session: Session): string | null {
  return session.memberships.find((m) => m.orgType === "platform")?.orgId ?? null;
}

type Cached = { orgId: string; data: NotificationPreferenceList };

let cached: Cached | null = null;
let inflight: { orgId: string; promise: Promise<NotificationPreferenceList> } | null = null;
const listeners = new Set<() => void>();

export function subscribePlatformNotificationPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function loadPlatformNotificationPrefs(
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

export async function savePlatformNotificationPrefs(
  orgId: string,
  items: NotificationPreference[],
): Promise<NotificationPreferenceList> {
  const data = await putNotificationPreferences(orgId, items);
  cached = { orgId, data };
  for (const fn of listeners) fn();
  return data;
}

/** In-app alert allowed for this event (defaults on until prefs load). */
export function platformInAppEnabled(
  prefs: NotificationPreferenceList | null,
  eventType: PlatformNotificationEvent,
): boolean {
  const row = prefs?.items.find((r) => r.eventType === eventType);
  return row ? row.inApp : true;
}
