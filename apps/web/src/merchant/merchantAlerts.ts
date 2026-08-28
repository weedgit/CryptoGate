import type { AlertItem, AlertsSource } from "../platform/ui/AlertsDrawer";
import type { Session } from "./api";
import {
  listOrders,
  listOrgs,
  listServiceBills,
  listSettlement,
  listSiteOverrides,
  listWebhookDeliveries,
  listWebhooks,
  listXpub,
  type PaymentOrder,
  type ServiceBill,
  type SiteSettingOverride,
} from "./api";
import { anomalyReasonLabel, formatShortTime } from "./orderStatus";
import {
  formatCountdown,
  parentMerchantOrgId,
  primaryMerchantOrgId,
  sessionCanViewIntegrations,
  sessionIsCashierOnly,
  sessionIsOrgOwner,
} from "./org";

type Listener = (items: AlertItem[]) => void;

export type MerchantAlertsRefreshResult = {
  unread: number;
  urgentUnread: number;
};

const LIVE: AlertItem[] = [];
const listeners = new Set<Listener>();

let readIds = new Set<string>();
let readScope = "";

const WEBHOOK_FAIL_ATTEMPTS = 5;
const SETTING_KIND_LABELS: Record<SiteSettingOverride["settingKind"], string> = {
  settlement: "settlement address",
  xpub: "xPub (Mode S)",
  matching_mode: "matching mode",
  order_retention: "order retention",
};

function readStorageKey(email: string): string {
  return `cryptogate.merchant.alertsRead.${email}`;
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

function anomalyAlert(order: PaymentOrder): AlertItem {
  const cause = anomalyReasonLabel(order.anomalyReason);
  return {
    id: `anomaly:${order.id}`,
    category: "payments",
    title: "Payment anomaly",
    body: cause
      ? `Order #${order.orderNumber} — ${cause}.`
      : `Order #${order.orderNumber} needs manual review.`,
    at: formatShortTime(order.createdAt ?? order.expiresAt),
    href: `/merchant/orders/${order.id}`,
    hrefLabel: "Review order",
    tone: "anomaly",
    urgent: true,
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
    title: "Settlement cool-down active",
    body: remaining
      ? `New ${asset} address activates in ${remaining}.`
      : `New ${asset} settlement address activates ${formatShortTime(activatesAt)}.`,
    at: formatShortTime(activatesAt),
    href: "/merchant/settings/settlement",
    hrefLabel: "Settlement",
    tone: "warn",
    urgent: true,
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
    title: "xPub cool-down active",
    body: remaining
      ? `Mode S xPub for ${asset} activates in ${remaining}.`
      : `Mode S xPub activates ${formatShortTime(activatesAt)}.`,
    at: formatShortTime(activatesAt),
    href: "/merchant/settings/settlement",
    hrefLabel: "Settlement",
    tone: "warn",
    urgent: true,
  };
}

function serviceBillAlert(bill: ServiceBill): AlertItem {
  const overdue = bill.status === "overdue";
  const ref = billRef(bill);
  return {
    id: `bill:${bill.id}`,
    category: "billing",
    title: overdue ? "Service bill overdue" : "Service bill issued",
    body: overdue
      ? `${ref} · ${bill.totalAmount} ${bill.currency} — pay to avoid account restriction.`
      : `${ref} · ${bill.totalAmount} ${bill.currency} · due ${formatShortTime(bill.dueAt)}.`,
    at: formatShortTime(bill.dueAt),
    href: `/merchant/service-bills/${bill.id}`,
    hrefLabel: overdue ? "Pay bill" : "View bill",
    tone: overdue ? "warn" : "info",
    urgent: overdue,
  };
}

function siteOverridePendingForParent(
  siteName: string,
  siteId: string,
  row: SiteSettingOverride,
): AlertItem {
  const kind = SETTING_KIND_LABELS[row.settingKind] ?? row.settingKind;
  return {
    id: `site-override:pending:${row.id}`,
    category: "security",
    title: "Site override approval",
    body: `${siteName} requested a ${kind} override — review and approve or deny.`,
    at: formatShortTime(row.createdAt),
    href: `/merchant/sites/${siteId}`,
    hrefLabel: "Review",
    tone: "warn",
    urgent: true,
  };
}

function siteOverridePendingForSite(row: SiteSettingOverride): AlertItem {
  const kind = SETTING_KIND_LABELS[row.settingKind] ?? row.settingKind;
  return {
    id: `site-override:pending:${row.id}`,
    category: "security",
    title: "Override pending approval",
    body: `Your ${kind} override is waiting for parent merchant Owner approval.`,
    at: formatShortTime(row.createdAt),
    href: `/merchant/settings/settlement`,
    hrefLabel: "Settings",
    tone: "info",
    urgent: false,
  };
}

function siteOverrideDecidedAlert(
  row: SiteSettingOverride,
  approved: boolean,
): AlertItem {
  const kind = SETTING_KIND_LABELS[row.settingKind] ?? row.settingKind;
  return {
    id: `site-override:decided:${row.id}`,
    category: "security",
    title: approved ? "Override approved" : "Override denied",
    body: approved
      ? `Parent merchant approved your ${kind} override.`
      : `Parent merchant denied your ${kind} override.`,
    at: formatShortTime(row.decidedAt ?? row.createdAt),
    href: `/merchant/settings/settlement`,
    hrefLabel: "Settings",
    tone: approved ? "ok" : "warn",
    urgent: false,
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
    title: "Webhook delivery failing",
    body: `${host} failed ${attempts} times — check endpoint availability and signing.`,
    at: at ? formatShortTime(at) : "Recent",
    href: "/merchant/settings/integrations",
    hrefLabel: "Integrations",
    tone: "warn",
    urgent: true,
  };
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
  return LIVE.filter((a) => !readIds.has(a.id)).length;
}

export function countUrgentUnreadMerchantAlerts(): number {
  return LIVE.filter((a) => a.urgent && !readIds.has(a.id)).length;
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

async function loadBillingAlerts(next: AlertItem[]): Promise<void> {
  try {
    const billList = await listServiceBills();
    for (const bill of billList.filter(
      (b) => b.status === "overdue" || b.status === "issued",
    )) {
      next.push(serviceBillAlert(bill));
    }
  } catch {
    /* ignore */
  }
}

function isRecentIso(iso: string | null | undefined, maxAgeMs: number): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= maxAgeMs;
}

async function loadSiteOverrideAlerts(
  session: Session,
  orgId: string,
  next: AlertItem[],
): Promise<void> {
  const membership = session.memberships.find((m) => m.orgId === orgId);
  const orgType = membership?.orgType;

  if (orgType === "merchant_site") {
    try {
      const rows = await listSiteOverrides(orgId);
      for (const row of rows.filter((r) => r.status === "pending")) {
        next.push(siteOverridePendingForSite(row));
      }
      for (const row of rows.filter(
        (r) =>
          (r.status === "approved" || r.status === "denied") &&
          isRecentIso(r.decidedAt ?? r.createdAt, 7 * 24 * 60 * 60 * 1000),
      )) {
        next.push(siteOverrideDecidedAlert(row, row.status === "approved"));
      }
    } catch {
      /* ignore */
    }
    return;
  }

  const parentId = parentMerchantOrgId(session);
  if (!parentId || !sessionIsOrgOwner(session, parentId)) return;

  try {
    const orgs = await listOrgs();
    const sites = orgs.filter(
      (o) => o.type === "merchant_site" && o.parentId === parentId,
    );
    for (const site of sites) {
      let rows: SiteSettingOverride[] = [];
      try {
        rows = await listSiteOverrides(site.id);
      } catch {
        continue;
      }
      for (const row of rows.filter((r) => r.status === "pending")) {
        next.push(siteOverridePendingForParent(site.name, site.id, row));
      }
    }
  } catch {
    /* ignore */
  }
}

async function loadWebhookFailureAlerts(orgId: string, next: AlertItem[]): Promise<void> {
  try {
    const hooks = await listWebhooks(orgId);
    for (const hook of hooks) {
      if (!hook.enabled) continue;
      let deliveries;
      try {
        deliveries = await listWebhookDeliveries(hook.id, orgId);
      } catch {
        continue;
      }
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
  const next: AlertItem[] = [];

  if (orgId && !cashierOnly) {
    await Promise.all([
      loadSettlementAlerts(orgId, next),
      loadXpubAlerts(orgId, next),
      loadBillingAlerts(next),
      loadSiteOverrideAlerts(session, orgId, next),
      sessionCanViewIntegrations(session)
        ? loadWebhookFailureAlerts(orgId, next)
        : Promise.resolve(),
    ]);
  }

  try {
    const orders = await listOrders({ limit: 500 });
    for (const order of orders.filter((o) => o.status === "payment_anomaly")) {
      next.push(anomalyAlert(order));
    }
  } catch {
    /* ignore */
  }

  LIVE.length = 0;
  LIVE.push(...next);
  emit();

  return {
    unread: countUnreadMerchantAlerts(),
    urgentUnread: countUrgentUnreadMerchantAlerts(),
  };
}

export const merchantAlertsSource: AlertsSource = {
  list: listMerchantAlerts,
  subscribe: subscribeMerchantAlerts,
  markRead: markMerchantAlertRead,
  markAllRead: markAllMerchantAlertsRead,
};

export function merchantAlertsToastKey(email: string): string {
  return `cryptogate.merchant.alertsToast.${email}`;
}

export function merchantAlertsToastMessage(urgentUnread: number): string {
  if (urgentUnread <= 0) return "";
  if (urgentUnread === 1) return "1 item needs your attention";
  return `${urgentUnread} items need your attention`;
}
