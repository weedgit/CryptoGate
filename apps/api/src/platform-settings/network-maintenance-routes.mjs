import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  canReadPlatformOrgPolicy,
} from "../orgs/role-policy.mjs";
import { buildNetworkCatalog } from "./network-catalog.mjs";
import {
  isKnownNetworkId,
  validatePutNetworkMaintenanceBody,
} from "./network-maintenance-rules.mjs";
import {
  listActiveNetworkMaintenance,
  upsertNetworkMaintenance,
} from "./network-maintenance-store.mjs";

/**
 * GET /v1/platform/networks/catalog — B16 cards (registry + maintenance + ingest).
 */
export async function handleGetNetworkCatalog(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canReadPlatformOrgPolicy(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read network catalog");
    return;
  }
  try {
    const catalog = await buildNetworkCatalog();
    sendJson(res, 200, catalog);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[network-catalog]", message);
    sendError(res, 500, "internal_error", "Failed to load network catalog");
  }
}

/**
 * PUT /v1/platform/networks/{network}/maintenance — platform O/A.
 */
export async function handlePutNetworkMaintenance(req, res, networkRaw) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (caller.platformOperator !== true) {
    sendError(
      res,
      403,
      "forbidden",
      "Only platform Owner or Administrator may change network maintenance",
    );
    return;
  }

  const network = typeof networkRaw === "string" ? networkRaw.trim() : "";
  if (!isKnownNetworkId(network)) {
    sendError(res, 404, "not_found", "Unknown network id");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validatePutNetworkMaintenanceBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  try {
    const row = await upsertNetworkMaintenance({
      network,
      active: validated.active,
      message: validated.message,
      endsAt: validated.endsAt,
      updatedByUserId: caller.userId,
    });
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId: null,
      action: AUDIT_ACTIONS.networkMaintenancePut,
      metadata: {
        network,
        active: validated.active,
        endsAt: validated.endsAt,
      },
    });
    sendJson(res, 200, {
      network: row.network,
      active: row.active,
      message: row.message,
      startedAt: row.startedAt,
      endsAt: row.endsAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/network_maintenance|does not exist/i.test(message)) {
      sendError(
        res,
        503,
        "unavailable",
        "network_maintenance table missing — run migrations",
      );
      return;
    }
    console.error("[network-maintenance]", message);
    sendError(res, 500, "internal_error", "Failed to update network maintenance");
  }
}

/**
 * GET /v1/networks/status — any authenticated session.
 * Compact orderability lamps (Open / Paused / Down / Off) for merchant + agent UIs.
 */
export async function handleGetNetworksStatus(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  try {
    const catalog = await buildNetworkCatalog();
    sendJson(res, 200, {
      chainEnv: catalog.chainEnv,
      checkedAt: catalog.checkedAt,
      items: catalog.items.map((card) => ({
        network: card.network,
        title: card.title,
        lamp: card.lamp,
        maintenance: {
          active: card.maintenance.active,
          message: card.maintenance.message,
        },
        ingestStatus: card.ingest.ingestStatus,
        pairs: card.pairs.map((p) => ({
          asset: p.asset,
          enabled: p.enabled,
          lamp: p.lamp,
          displayNetwork: p.displayNetwork,
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[networks-status]", message);
    sendError(res, 500, "internal_error", "Failed to load network status");
  }
}

/**
 * GET /v1/network-maintenance — any authenticated session (merchant banners).
 */
export async function handleListActiveNetworkMaintenance(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  try {
    const items = await listActiveNetworkMaintenance();
    sendJson(res, 200, {
      items: items.map((row) => ({
        network: row.network,
        message: row.message,
        startedAt: row.startedAt,
        endsAt: row.endsAt,
      })),
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/network_maintenance|does not exist/i.test(message)) {
      sendJson(res, 200, {
        items: [],
        checkedAt: new Date().toISOString(),
        note: "network_maintenance table missing — run migrations",
      });
      return;
    }
    sendError(res, 500, "internal_error", "Failed to load network maintenance");
  }
}
