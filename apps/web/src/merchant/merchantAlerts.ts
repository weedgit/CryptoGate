import type { AlertItem, AlertsSource } from "../platform/ui/AlertsDrawer";
import { merchantRoute } from "../shared/portalRouting";
import type { Session } from "./api";
import {
  getNotificationPreferences,
  getOrderSummary,
  listServiceBills,
  listSettlement,
  listWebhookDeliveries,
  listWebhooks,
  listXpub,
  type PaymentOrder,
  type ServiceBill,
} from "./api";
import { anomalyAmountLine, anomalyExplain, formatShortTime } from "./orderStatus";
import {
  formatCountdown,
  primaryMerchantOrgId,
  sessionCanCheckoutServiceBill,
  sessionCanManageIntegrations,
  sessionIsCashierOnly,
  sessionRoleOnOrg,
} from "./org";

type Listener = (items: AlertItem[]) => void;

export type MerchantAlertsRefreshResult = {
  unread: number;
  urgentUnread: number;
  unresolved: number;
};

const LIVE: AlertItem[] = [];
const listeners = new Set<Listener>();

let readIds = new Set<string>();
let readScope = "";

const WEBHOOK_FAIL_ATTEMPTS = 5;

function readStorageKey(email: string): string {
  return `paymentgate.merchant.alertsRead.${email}`;
}

function loadReadIds(email: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(readStorageKey(email));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function saveReadIds(): void {
  if (!readScope) return;
  try {
    sessionStorage.setItem(
      readStorageKey(readScope),
      JSON.stringify([...readIds]),
    );
  } catch {
    /* ignore */
  }
}

function withUnread(items: AlertItem[]): AlertItem[] {
  return items.map((a) => ({ ...a, unread: !readIds.has(a.id) }));
}

function emit(): void {
  const snapshot = withUnread(LIVE);
  for (const fn of listeners) fn(snapshot);
}

function billRef(bill: ServiceBill): string {
  const end = Date.parse(bill.periodEnd);
  if (Number.isFinite(end)) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(new Date(end));
  }
  return bill.id.slice(0, 8).toUpperCase();
}

function anomalyAlert(order: PaymentOrder, actionable: boolean): AlertItem {
  const explain = anomalyExplain({
    reason: order.anomalyReason,
    matchingMode: order.matchingMode,
    payableAmount: order.payableAmount?.amount,
    receivedAmount: order.receivedAmount?.amount,
    hasTx: Boolean(order.receivedAmount?.amount),
  });
  const amounts = anomalyAmountLine({
    payableAmount: order.payableAmount?.amount,
    receivedAmount: order.receivedAmount?.amount,
    asset: order.asset,
  });
  return {
    id: `anomaly:${order.id}`,
    category: "payments",
    title: "Payment needs review",
    body: [
      `Order #${order.orderNumber} — ${explain.title}.`,
      amounts,
      actionable
        ? "Open the order, then Resolve with a note (no Mark paid)."
        : "Owner, Administrator, or the Cashier who created this order must Resolve with a note.",
    ]
      .filter(Boolean)
      .join(" "),
    at: formatShortTime(order.createdAt ?? order.expiresAt),
    href: merchantRoute(`orders/${order.id}`),
    hrefLabel: actionable ? "Review order" : "View order",
    tone: "anomaly",
    urgent: true,
    unresolved: true,
    actionable,
  };
}

function settlementCooldownAlert(
  orgId: string,
  activatesAt: string,
  asset: string,
  network: string,
): AlertItem {
  const remaining = formatCountdown(activatesAt);
  return {
    id: `settlement:cooldown:${orgId}:${asset}:${network}`,
    category: "security",
    title: "Settlement address change pending",
    body: remaining
      ? `New ${asset} (${network}) receive address activates in ${remaining}. Until then, open orders still use the current address.`
      : `New ${asset} (${network}) receive address activates ${formatShortTime(activatesAt)}. Until then, open orders still use the current address.`,
    at: formatShortTime(activatesAt),
    href: merchantRoute("settings/settlement"),
    hrefLabel: "Settlement",
    tone: "warn",
    urgent: true,
    unresolved: true,
    /** Cool-down clears itself; no role can skip it. */
    actionable: false,
  };
}

function xpubCooldownAlert(
  orgId: string,
  activatesAt: string,
  asset: string,
  network: string,
): AlertItem {
  const remaining = formatCountdown(activatesAt);
  return {
    id: `xpub:cooldown:${orgId}:${asset}:${network}`,
    category: "security",
    title: "xPub change pending",
    body: remaining
      ? `Mode S watch-only xPub for ${asset} (${network}) activates in ${remaining}. New HD addresses wait until then.`
      : `Mode S watch-only xPub for ${asset} (${network}) activates ${formatShortTime(activatesAt)}.`,
    at: formatShortTime(activatesAt),
    href: merchantRoute("settings/settlement"),
    hrefLabel: "Settlement",
    tone: "warn",
    urgent: true,
    unresolved: true,
    actionable: false,
  };
}

function serviceBillAlert(bill: ServiceBill, canPay: boolean): AlertItem {
  const overdue = bill.status === "overdue";
  const ref = billRef(bill);
  return {
    id: `bill:${bill.id}`,
    category: "billing",
    title: overdue ? "Service bill overdue" : "Service bill unpaid",
    body: overdue
      ? canPay
        ? `Bill ${ref} · ${bill.totalAmount} ${bill.currency} is overdue — pay the platform service bill to avoid account restriction.`
        : `Bill ${ref} · ${bill.totalAmount} ${bill.currency} is overdue — ask an Owner or Administrator to pay.`
      : canPay
        ? `Bill ${ref} · ${bill.totalAmount} ${bill.currency} is unpaid — due ${formatShortTime(bill.dueAt)}. This is platform fees, not a customer payment order.`
        : `Bill ${ref} · ${bill.totalAmount} ${bill.currency} is unpaid — due ${formatShortTime(bill.dueAt)}. An Owner or Administrator must pay.`,
    at: formatShortTime(bill.dueAt),
    href: merchantRoute(`service-bills/${bill.id}`),
    hrefLabel: canPay ? "Pay bill" : "View bill",
    tone: "warn",
    urgent: true,
    unresolved: true,
    actionable: canPay,
  };
}

function webhookFailureAlert(
  webhookId: string,
  url: string,
  attempts: number,
  at?: string,
): AlertItem {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url.slice(0, 32);
    }
  })();
  return {
    id: `webhook:fail:${webhookId}`,
    category: "system",
    title: "Webhook not reaching your server",
    body: `${host} failed ${attempts} times — check that your endpoint is up and verifies the signed payload.`,
    at: at ? formatShortTime(at) : "Recent",
    href: merchantRoute("settings/integrations"),
    hrefLabel: "Integrations",
    tone: "warn",
    urgent: true,
    unresolved: true,
    actionable: true,
  };
}

function canResolveAnomaly(session: Session, order: PaymentOrder): boolean {
  const orgId = order.orgId;
  if (!orgId) return false;
  const role = sessionRoleOnOrg(session, orgId);
  if (role === "cashier") {
    return Boolean(order.createdBy && order.createdBy === session.userId);
  }
  return role === "owner" || role === "administrator";
}

export function initMerchantAlertReads(userEmail: string): void {
  readScope = userEmail;
  readIds = loadReadIds(userEmail);
  emit();
}

export function subscribeMerchantAlerts(listener: Listener): () => void {
  listeners.add(listener);
  listener(withUnread(LIVE));
  return () => listeners.delete(listener);
}

export function listMerchantAlerts(): AlertItem[] {
  return withUnread(LIVE);
}

export function markMerchantAlertRead(id: string): void {
  readIds.add(id);
  saveReadIds();
  emit();
}

export function markAllMerchantAlertsRead(): void {
  for (const a of LIVE) readIds.add(a.id);
  saveReadIds();
  emit();
}

export function countUnreadMerchantAlerts(): number {
  return LIVE.filter(
    (a) => a.category !== "billing" && !readIds.has(a.id),
  ).length;
}

export function countUrgentUnreadMerchantAlerts(): number {
  return LIVE.filter((a) => a.urgent && !readIds.has(a.id)).length;
}

export function countUnresolvedMerchantAlerts(): number {
  return LIVE.filter((a) => a.unresolved !== false).length;
}

async function loadSettlementAlerts(orgId: string, next: AlertItem[]): Promise<void> {
  try {
    const settlement = await listSettlement(orgId);
    for (const row of settlement) {
      if (row.status !== "pending_cool_down" || !row.pendingActivatesAt) continue;
      next.push(
        settlementCooldownAlert(
          orgId,
          row.pendingActivatesAt,
          row.asset,
          row.network,
        ),
      );
    }
  } catch {
    /* ignore */
  }
}

async function loadXpubAlerts(orgId: string, next: AlertItem[]): Promise<void> {
  try {
    const rows = await listXpub(orgId);
    for (const row of rows) {
      if (row.status !== "pending_cool_down" || !row.pendingActivatesAt) continue;
      next.push(
        xpubCooldownAlert(orgId, row.pendingActivatesAt, row.asset, row.network),
      );
    }
  } catch {
    /* ignore */
  }
}

async function loadBillingAlerts(
  next: AlertItem[],
  canPay: boolean,
): Promise<void> {
  try {
    const billList = await listServiceBills();
    for (const bill of billList.filter(
      (b) => b.status === "overdue" || b.status === "issued",
    )) {
      next.push(serviceBillAlert(bill, canPay));
    }
  } catch {
    /* ignore */
  }
}

async function loadSiteOverrideAlerts(
  _session: Session,
  _orgId: string,
  _next: AlertItem[],
): Promise<void> {
  /* Sites inherit parent settings; override requests are not used. */
}

async function loadWebhookFailureAlerts(orgId: string, next: AlertItem[]): Promise<void> {
  try {
    const hooks = await listWebhooks(orgId);
    const enabled = hooks.filter((hook) => hook.enabled);
    const latestByHook = await Promise.all(
      enabled.map(async (hook) => {
        try {
          return { hook, deliveries: await listWebhookDeliveries(hook.id, orgId) };
        } catch {
          return null;
        }
      }),
    );
    for (const item of latestByHook) {
      if (!item) continue;
      const { hook, deliveries } = item;
      if (deliveries.length === 0) continue;
      const sorted = [...deliveries].sort((a, b) => {
        const ta = Date.parse(a.deliveredAt ?? a.createdAt ?? "");
        const tb = Date.parse(b.deliveredAt ?? b.createdAt ?? "");
        return tb - ta;
      });
      const latest = sorted[0];
      if (latest.status !== "failed") continue;
      if ((latest.attempt ?? 0) < WEBHOOK_FAIL_ATTEMPTS) continue;
      next.push(
        webhookFailureAlert(
          hook.id,
          hook.url,
          latest.attempt ?? WEBHOOK_FAIL_ATTEMPTS,
          latest.deliveredAt ?? latest.createdAt,
        ),
      );
    }
  } catch {
    /* ignore */
  }
}

export async function refreshMerchantAlerts(
  session: Session,
): Promise<MerchantAlertsRefreshResult> {
  const orgId = primaryMerchantOrgId(session);
  const cashierOnly = sessionIsCashierOnly(session);
  const canPay = sessionCanCheckoutServiceBill(session);
  const canManageHooks = sessionCanManageIntegrations(session);
  const ordersPromise = getOrderSummary(
    new Date(0).toISOString(),
    new Date().toISOString(),
  );
  const next: AlertItem[] = [];

  if (orgId && !cashierOnly) {
    await Promise.all([
      loadSettlementAlerts(orgId, next),
      loadXpubAlerts(orgId, next),
      loadBillingAlerts(next, canPay),
      loadSiteOverrideAlerts(session, orgId, next),
      canManageHooks ? loadWebhookFailureAlerts(orgId, next) : Promise.resolve(),
    ]);
  }

  try {
    const summary = await ordersPromise;
    for (const order of summary.anomalies) {
      next.push(anomalyAlert(order, canResolveAnomaly(session, order)));
    }
  } catch {
    /* ignore */
  }

  /** Honor D15 in-app toggles when preferences are available. */
  let filtered = next;
  if (orgId && !cashierOnly) {
    try {
      const prefs = (await getNotificationPreferences(orgId)).items;
      const inAppOff = new Set(
        prefs.filter((p) => !p.inApp).map((p) => p.eventType),
      );
      if (inAppOff.size > 0) {
        filtered = next.filter((a) => {
          const eventType = alertEventType(a);
          return !eventType || !inAppOff.has(eventType);
        });
      }
    } catch {
      /* keep unfiltered if prefs unavailable */
    }
  }

  LIVE.length = 0;
  LIVE.push(...filtered);
  emit();

  return {
    unread: countUnreadMerchantAlerts(),
    urgentUnread: countUrgentUnreadMerchantAlerts(),
    unresolved: countUnresolvedMerchantAlerts(),
  };
}

function alertEventType(alert: AlertItem): string | null {
  if (alert.id.startsWith("settlement:")) return "settlement_address";
  if (alert.id.startsWith("xpub:")) return "xpub_change";
  if (alert.id.startsWith("webhook:")) return "webhook_failures";
  if (alert.id.startsWith("bill:") || alert.category === "billing") {
    return "service_bills";
  }
  if (alert.id.startsWith("site-override:") || alert.id.includes("override")) {
    return "site_overrides";
  }
  if (alert.id.startsWith("anomaly:")) {
    return "payment_anomaly";
  }
  return null;
}

export const merchantAlertsSource: AlertsSource = {
  list: listMerchantAlerts,
  subscribe: subscribeMerchantAlerts,
  markRead: markMerchantAlertRead,
  markAllRead: markAllMerchantAlertsRead,
};
