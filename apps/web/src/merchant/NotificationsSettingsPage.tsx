import { useMemo } from "react";
import {
  getNotificationPreferences,
  putNotificationPreferences,
  type Session,
} from "./api";
import { AlertSettingsPage, type AlertEventMeta } from "../shared/AlertSettingsPage";
import { primaryMerchantOrgId } from "./org";

const MERCHANT_ALERT_EVENTS: AlertEventMeta[] = [
  {
    eventType: "payment_completed",
    icon: "payment",
    label: "Payment completed",
    blurb: "Order reaches Completed after required confirmations.",
  },
  {
    eventType: "payment_anomaly",
    icon: "anomaly",
    label: "Attention",
    blurb: "Underpay, overpay, collision, or wrong-network cases.",
  },
  {
    eventType: "settlement_address",
    icon: "wallet",
    label: "Settlement address change",
    blurb: "Pending cool-down and activation alerts.",
  },
  {
    eventType: "xpub_change",
    icon: "key",
    label: "xPub change",
    blurb: "Mode S watch-only xPub register or rotate.",
  },
  {
    eventType: "webhook_failures",
    icon: "webhook",
    label: "Webhook delivery failures",
    blurb: "Signed callback retries that exhaust or fail.",
  },
  {
    eventType: "service_bills",
    icon: "bill",
    label: "Service bill issued / overdue",
    blurb: "Platform SaaS invoices that need remittance.",
  },
];

type Props = { session: Session };

/** D15 — notification preferences (persisted per user + org; every member sets their own). */
export function NotificationsSettingsPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  return (
    <AlertSettingsPage
      orgId={orgId}
      events={MERCHANT_ALERT_EVENTS}
      load={getNotificationPreferences}
      save={putNotificationPreferences}
      noOrgMessage="No merchant organization is available for this account."
    />
  );
}
