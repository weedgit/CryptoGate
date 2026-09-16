/**
 * In-process SSE subscribers for dashboard live updates.
 * Orders: watcher → DB outbox → webhook fanout publishes here.
 * Bills/orgs/commissions/networks: in-API publish after successful writes.
 */

/**
 * @typedef {{
 *   kind: "all"
 * } | {
 *   kind: "none"
 * } | {
 *   kind: "orgs",
 *   orgIds: Set<string>,
 *   treeRootIds: Set<string>,
 * }} DashboardEventAudience
 */

/**
 * @typedef {(
 *   "volume" | "anomalies" | "serviceBills" | "orgs" | "commissions" | "networks"
 * )} DashboardLiveSlice
 */

/**
 * @typedef {{
 *   type: string,
 *   slices: DashboardLiveSlice[],
 *   orgId?: string | null,
 *   parentId?: string | null,
 *   orderId?: string,
 *   orderNumber?: string,
 *   broadcast?: boolean,
 *   at: string,
 * }} DashboardLiveEvent
 */

/**
 * @typedef {{
 *   id: number,
 *   audience: DashboardEventAudience,
 *   write: (chunk: string) => void,
 *   pingAt: number,
 * }} DashboardEventClient
 */

/** @type {Map<number, DashboardEventClient>} */
const clients = new Map();
let nextId = 1;

/**
 * @param {DashboardEventAudience} audience
 * @param {(chunk: string) => void} write
 */
export function subscribeDashboardEvents(audience, write) {
  const id = nextId++;
  /** @type {DashboardEventClient} */
  const client = { id, audience, write, pingAt: Date.now() };
  clients.set(id, client);
  return () => {
    clients.delete(id);
  };
}

export function dashboardEventSubscriberCount() {
  return clients.size;
}

/**
 * @param {DashboardEventAudience} audience
 * @param {DashboardLiveEvent} event
 */
export function audienceMaySeeEvent(audience, event) {
  if (audience.kind === "all") return true;
  if (audience.kind === "none") return false;
  if (event.broadcast) return true;
  if (event.orgId && audience.orgIds.has(event.orgId)) return true;
  if (event.parentId) {
    if (audience.orgIds.has(event.parentId)) return true;
    if (audience.treeRootIds.has(event.parentId)) return true;
  }
  return false;
}

/**
 * @param {DashboardLiveEvent} event
 */
export function publishDashboardEvent(event) {
  const data = `event: dashboard\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients.values()) {
    if (!audienceMaySeeEvent(client.audience, event)) continue;
    try {
      client.write(data);
    } catch {
      clients.delete(client.id);
    }
  }
}

/**
 * Safe publish helper for route/job hooks.
 * @param {{
 *   type: string,
 *   slices: DashboardLiveSlice[],
 *   orgId?: string | null,
 *   parentId?: string | null,
 *   broadcast?: boolean,
 * }} input
 */
export function emitDashboardLive(input) {
  try {
    publishDashboardEvent({
      ...input,
      at: new Date().toISOString(),
    });
  } catch {
    // Never fail a write path because of SSE.
  }
}

/** Keepalive comments so proxies do not close idle streams. */
export function pingDashboardEventClients() {
  const now = Date.now();
  const chunk = `: ping ${now}\n\n`;
  for (const client of clients.values()) {
    if (now - client.pingAt < 20_000) continue;
    try {
      client.write(chunk);
      client.pingAt = now;
    } catch {
      clients.delete(client.id);
    }
  }
}

/**
 * Map webhook outbox event_type → dashboard live event (or null to skip).
 * @param {{
 *   event_type: string,
 *   org_id: string,
 *   order_id: string,
 *   order_number?: string,
 *   created_at?: Date | string,
 * }} row
 * @returns {DashboardLiveEvent | null}
 */
export function dashboardEventFromOutboxRow(row) {
  const at =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at
        ? String(row.created_at)
        : new Date().toISOString();

  if (row.event_type === "payment_order.completed") {
    return {
      type: "order.settled",
      slices: ["volume"],
      orgId: String(row.org_id),
      orderId: String(row.order_id),
      orderNumber: row.order_number ? String(row.order_number) : undefined,
      at,
    };
  }

  if (row.event_type === "payment_order.payment_anomaly") {
    return {
      type: "order.anomaly",
      slices: ["anomalies"],
      orgId: String(row.org_id),
      orderId: String(row.order_id),
      orderNumber: row.order_number ? String(row.order_number) : undefined,
      at,
    };
  }

  return null;
}
