import {
  clearPlatformAlert,
  relativeAlertTime,
  upsertPlatformAlert,
} from "../platform/platformAlerts";
import { platformRoute } from "./portalRouting";

export type PlatformHealthSnapshot = {
  api: boolean;
  database: boolean;
  webhook: boolean;
};

const HEALTH_HREF = platformRoute("ops/health");

/**
 * Upsert / clear system alerts from a health probe.
 * Shared by platform topbar and agent shell so unresolved banners stay honest.
 */
export function syncPlatformHealthAlerts(
  health: PlatformHealthSnapshot | "unreachable",
): void {
  if (health === "unreachable") {
    upsertPlatformAlert({
      id: "sys-api",
      category: "system",
      title: "API / network unreachable",
      body: "Could not reach the platform health endpoint. Check API process and network connectivity.",
      at: relativeAlertTime(),
      href: HEALTH_HREF,
      hrefLabel: "System health",
      unread: true,
      tone: "anomaly",
      urgent: true,
      unresolved: true,
      actionable: true,
    });
    upsertPlatformAlert({
      id: "sys-database",
      category: "system",
      title: "Database status unknown",
      body: "Health probe failed before DB status could be confirmed.",
      at: relativeAlertTime(),
      href: HEALTH_HREF,
      hrefLabel: "System health",
      unread: true,
      tone: "warn",
      urgent: true,
      unresolved: true,
      actionable: true,
    });
    clearPlatformAlert("sys-webhook");
    return;
  }

  if (health.api && health.database && health.webhook) {
    clearPlatformAlert("sys-api");
    clearPlatformAlert("sys-database");
    clearPlatformAlert("sys-webhook");
    return;
  }

  if (!health.api) {
    upsertPlatformAlert({
      id: "sys-api",
      category: "system",
      title: "API unreachable",
      body: "Platform API health check failed. Session calls may also fail until the API recovers.",
      at: relativeAlertTime(),
      href: HEALTH_HREF,
      hrefLabel: "System health",
      unread: true,
      tone: "anomaly",
      urgent: true,
      unresolved: true,
      actionable: true,
    });
  } else {
    clearPlatformAlert("sys-api");
  }

  if (!health.database) {
    upsertPlatformAlert({
      id: "sys-database",
      category: "system",
      title: "Database unhealthy",
      body: "Postgres health check failed. Reads and writes may be interrupted.",
      at: relativeAlertTime(),
      href: HEALTH_HREF,
      hrefLabel: "System health",
      unread: true,
      tone: "anomaly",
      urgent: true,
      unresolved: true,
      actionable: true,
    });
  } else {
    clearPlatformAlert("sys-database");
  }

  if (!health.webhook) {
    upsertPlatformAlert({
      id: "sys-webhook",
      category: "system",
      title: "Webhook delivery degraded",
      body: "Webhook worker is off, stale, or backlog is overdue. Merchant signed deliveries may lag — check System health.",
      at: relativeAlertTime(),
      href: HEALTH_HREF,
      hrefLabel: "System health",
      unread: true,
      tone: "warn",
      urgent: true,
      unresolved: true,
      actionable: true,
    });
  } else {
    clearPlatformAlert("sys-webhook");
  }
}

export async function fetchPlatformHealth(): Promise<
  PlatformHealthSnapshot | "unreachable"
> {
  const { fetchSharedHealth } = await import("./healthPolling");
  return fetchSharedHealth();
}
