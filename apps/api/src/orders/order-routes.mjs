import { createHash } from "node:crypto";
import { OrderStatus } from "@paymentgate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller, assertApiKeyScope } from "../http/require-caller.mjs";
import { canCancelPaymentOrder, canResolvePaymentAnomaly, resolveOrderOrgId } from "../orgs/role-policy.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { callerCanReadPaymentOrder } from "./order-list-routes.mjs";
import {
  extraCreateOrderKeys,
  idempotencyBodyHashPayload,
  validateCreateOrderBody,
} from "./order-rules.mjs";
import { assignOnOrderCreate } from "./order-matching.mjs";
import {
  cancelPendingPaymentOrder,
  findOrderById,
  findOrderByIdempotency,
  insertPaymentOrder,
  resolvePaymentAnomaly,
  toPaymentOrder,
  withCreateOrderLock,
} from "./order-store.mjs";
import { toOnChainDetails, toPaymentDetails } from "./order-map.mjs";
import {
  getEffectiveMatchingMode,
  getEffectiveUnderpayTolerance,
} from "../matching-mode/matching-mode-store.mjs";
import { getEffectiveFulfillmentPolicy } from "../fulfillment-policy/fulfillment-policy-store.mjs";
import { bindHdPoolOrder } from "../mode-s/hd-pool-store.mjs";
import { resolveSiteInherit } from "../sites/site-inherit.mjs";
import { getEffectiveNetworkMaintenance } from "../platform-settings/network-maintenance-store.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 */
function readIdempotencyKey(req) {
  const raw = req.headers["idempotency-key"];
  const key = typeof raw === "string" ? raw.trim() : "";
  if (key.length < 8 || key.length > 128) return null;
  return key;
}

function hashBody(payload) {
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * POST /v1/orders — assign via `@paymentgate/matching` (M2-12).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleCreatePaymentOrder(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!assertApiKeyScope(caller, res, "orders")) return;

  const idempotencyKey = readIdempotencyKey(req);
  if (!idempotencyKey) {
    sendError(
      res,
      400,
      "idempotency_required",
      "Idempotency-Key header is required (8–128 characters)",
    );
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const { extra, privileged } = extraCreateOrderKeys(body);
  if (privileged.length > 0) {
    const roleIsCashier = caller.memberships.some((m) => m.role === "cashier");
    sendError(
      res,
      roleIsCashier ? 403 : 400,
      roleIsCashier ? "forbidden" : "invalid_request",
      roleIsCashier
        ? "Cashiers cannot set matching mode, receive address, or fees"
        : "Do not send matchingMode, receiveAddress, or fee fields",
    );
    return;
  }
  if (extra.length > 0) {
    sendError(res, 400, "invalid_request", "Unknown fields in request body");
    return;
  }

  const validated = validateCreateOrderBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  try {
    const maint = await getEffectiveNetworkMaintenance(validated.parsed.network);
    if (maint) {
      const until = maint.endsAt
        ? ` until ${new Date(maint.endsAt).toISOString()}`
        : "";
      sendError(
        res,
        422,
        "network_maintenance",
        maint.message ||
          `Network ${validated.parsed.network} is in maintenance${until}`,
      );
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/network_maintenance|does not exist/i.test(message)) {
      sendError(res, 500, "internal_error", "Failed to check network maintenance");
      return;
    }
  }

  const scope = resolveOrderOrgId(caller.memberships, validated.parsed.orgId);
  if (!scope.ok) {
    sendError(res, scope.status, scope.code, scope.message);
    return;
  }

  const merchantOrg = await findOrgById(scope.orgId);
  if (!merchantOrg) {
    sendError(res, 404, "not_found", "Merchant org not found");
    return;
  }
  if (merchantOrg.status === "paused") {
    sendError(
      res,
      403,
      "org_paused",
      "Merchant account is paused; payment orders cannot be created",
    );
    return;
  }
  if (merchantOrg.order_create_suspended === true) {
    sendError(
      res,
      403,
      "order_create_suspended",
      "Platform compliance has suspended payment order creation for this merchant",
    );
    return;
  }
  if (merchantOrg.type === "merchant_site" && merchantOrg.parent_id) {
    const parentOrg = await findOrgById(merchantOrg.parent_id);
    if (parentOrg?.status === "paused" || parentOrg?.order_create_suspended === true) {
      sendError(
        res,
        403,
        parentOrg.order_create_suspended ? "order_create_suspended" : "org_paused",
        parentOrg.order_create_suspended
          ? "Platform compliance has suspended payment order creation for the parent merchant"
          : "Parent merchant account is paused; payment orders cannot be created",
      );
      return;
    }
  }

  const bodyHash = hashBody(idempotencyBodyHashPayload(validated.parsed));
  const existingOutside = await findOrderByIdempotency(scope.orgId, idempotencyKey);
  if (existingOutside) {
    if (existingOutside.idempotency_body_hash !== bodyHash) {
      sendError(
        res,
        409,
        "idempotency_conflict",
        "Idempotency-Key was reused with a different body",
      );
      return;
    }
    sendJson(res, 201, toPaymentOrder(existingOutside));
    return;
  }

  /** @type {{ kind: "created", row: object } | { kind: "replay", row: object } | { kind: "error", status: number, code: string, message: string, details?: unknown } | { kind: "conflict" }} */
  let outcome;
  try {
    const inherit = await resolveSiteInherit(merchantOrg);
    outcome = await withCreateOrderLock(
      inherit.settlementOrgId,
      validated.parsed.asset,
      validated.parsed.network,
      async (client) => {
        const existing = await findOrderByIdempotency(
          scope.orgId,
          idempotencyKey,
          client,
        );
        if (existing) {
          if (existing.idempotency_body_hash !== bodyHash) {
            return { kind: "conflict" };
          }
          return { kind: "replay", row: existing };
        }

        const matchingMode = await getEffectiveMatchingMode(
          inherit.matchingOrgId,
          client,
        );
        const fulfillmentPolicy = await getEffectiveFulfillmentPolicy(
          inherit.fulfillmentOrgId,
          client,
        );
        const underpayTolerance =
          matchingMode === "B"
            ? await getEffectiveUnderpayTolerance(inherit.matchingOrgId, client)
            : "0";
        const assigned = await assignOnOrderCreate({
          client,
          orgId: scope.orgId,
          settlementOrgId: inherit.settlementOrgId,
          xpubOrgId: inherit.xpubOrgId,
          walletGroupOrgIds: inherit.walletGroupOrgIds,
          matchingMode,
          asset: validated.parsed.asset,
          network: validated.parsed.network,
          amount: validated.parsed.amount,
          idempotencyKey,
          requiredConfirmations: validated.parsed.config.requiredConfirmations,
        });
        if (!assigned.ok) {
          return {
            kind: "error",
            status: assigned.status,
            code: assigned.code,
            message: assigned.message,
            details: assigned.details,
          };
        }

        const expiresAt = new Date(
          Date.now() + validated.parsed.validitySeconds * 1000,
        );
        const inserted = await insertPaymentOrder(
          {
            orgId: scope.orgId,
            createdBy: caller.userId,
            status: OrderStatus.PendingPayment,
            matchingMode: assigned.assign.matchingMode,
            payableAmount: assigned.assign.payableAmount.amount,
            receiveAddress: assigned.assign.receiveAddress,
            addressSource: assigned.assign.addressSource,
            hdIndex: assigned.assign.hdIndex,
            memoOrTag: assigned.assign.memoOrTag,
            asset: validated.parsed.asset,
            network: validated.parsed.network,
            expiresAt,
            requiredConfirmations: assigned.assign.requiredConfirmations,
            idempotencyKey,
            idempotencyBodyHash: bodyHash,
            merchantMetadata: validated.parsed.merchantMetadata,
            underpayTolerance,
            fulfillmentPolicy,
          },
          client,
        );

        if (!inserted.ok) {
          const raced = await findOrderByIdempotency(
            scope.orgId,
            idempotencyKey,
            client,
          );
          if (raced && raced.idempotency_body_hash === bodyHash) {
            return { kind: "replay", row: raced };
          }
          return { kind: "conflict" };
        }

        if (
          assigned.assign.addressSource === "hd_pool" &&
          assigned.assign.hdIndex != null
        ) {
          await bindHdPoolOrder(client, {
            orgId: inherit.xpubOrgId,
            asset: validated.parsed.asset,
            network: validated.parsed.network,
            hdIndex: assigned.assign.hdIndex,
            receiveAddress: assigned.assign.receiveAddress,
            orderId: inserted.row.id,
          });
        }

        return { kind: "created", row: inserted.row };
      },
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.error("create payment order failed", err);
    }
    sendError(res, 500, "internal_error", "Could not create payment order");
    return;
  }

  if (outcome.kind === "error") {
    sendError(res, outcome.status, outcome.code, outcome.message, outcome.details);
    return;
  }
  if (outcome.kind === "conflict") {
    sendError(
      res,
      409,
      "idempotency_conflict",
      "Idempotency-Key was reused with a different body",
    );
    return;
  }

  sendJson(res, 201, toPaymentOrder(outcome.row));
}

/**
 * Session + same merchant-read bar as GET /orders/{id}.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orderId
 */
async function loadReadablePaymentOrder(req, res, orderId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;
  if (!assertApiKeyScope(caller, res, "orders")) return null;

  const row = await findOrderById(orderId);
  if (!row) {
    sendError(res, 404, "not_found", "Order not found");
    return null;
  }
  if (
    !(await callerCanReadPaymentOrder(caller, {
      orgId: row.org_id,
      createdBy: row.created_by,
    }))
  ) {
    sendError(res, 403, "forbidden", "Outside merchant scope");
    return null;
  }
  return row;
}

/**
 * GET /v1/orders/{id} — merchant/cashier session. Cross-merchant is 403.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orderId
 */
export async function handleGetPaymentOrder(req, res, orderId) {
  const row = await loadReadablePaymentOrder(req, res, orderId);
  if (!row) return;
  sendJson(res, 200, toPaymentOrder(row));
}

/**
 * POST /v1/orders/{id}/cancel — pending only. O/A any on org; Cashier own.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orderId
 */
export async function handleCancelPaymentOrder(req, res, orderId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let note = null;
  try {
    const body = await readJsonBody(req);
    if (body && typeof body === "object" && "note" in body) {
      const raw = /** @type {{ note?: unknown }} */ (body).note;
      if (raw != null && typeof raw !== "string") {
        sendError(res, 400, "invalid_request", "note must be a string");
        return;
      }
      note = typeof raw === "string" ? raw.trim().slice(0, 500) || null : null;
    }
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const existing = await findOrderById(orderId);
  if (!existing) {
    sendError(res, 404, "not_found", "Order not found");
    return;
  }
  if (
    !(await callerCanReadPaymentOrder(caller, {
      orgId: existing.org_id,
      createdBy: existing.created_by,
    }))
  ) {
    sendError(res, 403, "forbidden", "Outside merchant scope");
    return;
  }
  if (
    !canCancelPaymentOrder(caller, {
      orgId: existing.org_id,
      createdBy: existing.created_by,
      status: existing.status,
    })
  ) {
    sendError(
      res,
      403,
      "forbidden",
      existing.status !== "pending_payment"
        ? "Only pending payment orders can be cancelled"
        : "Cashiers can cancel only their own pending orders; ask Owner or Administrator",
    );
    return;
  }

  const row = await cancelPendingPaymentOrder(orderId);
  if (!row) {
    sendError(
      res,
      409,
      "order_not_cancellable",
      "Order is no longer pending payment",
    );
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: row.org_id,
    action: "payment_order.cancelled",
    metadata: {
      orderId: row.id,
      orderNumber: row.order_number,
      ...(note ? { note } : {}),
    },
  });

  sendJson(res, 200, toPaymentOrder(row));
}

/**
 * POST /v1/orders/{id}/resolve-anomaly — required note; closes anomaly (→ cancelled).
 * Never Mark paid. O/A any on org; Cashier own only.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orderId
 */
export async function handleResolvePaymentAnomaly(req, res, orderId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let note = "";
  try {
    const body = await readJsonBody(req);
    if (!body || typeof body !== "object") {
      sendError(res, 400, "invalid_request", "Request body must be a JSON object");
      return;
    }
    const raw = /** @type {{ note?: unknown }} */ (body).note;
    if (typeof raw !== "string" || !raw.trim()) {
      sendError(
        res,
        400,
        "invalid_request",
        "note is required — briefly record what you checked (amount, tx, customer)",
      );
      return;
    }
    note = raw.trim().slice(0, 1000);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const existing = await findOrderById(orderId);
  if (!existing) {
    sendError(res, 404, "not_found", "Order not found");
    return;
  }
  if (
    !(await callerCanReadPaymentOrder(caller, {
      orgId: existing.org_id,
      createdBy: existing.created_by,
    }))
  ) {
    sendError(res, 403, "forbidden", "Outside merchant scope");
    return;
  }
  if (
    !canResolvePaymentAnomaly(caller, {
      orgId: existing.org_id,
      createdBy: existing.created_by,
      status: existing.status,
    })
  ) {
    sendError(
      res,
      403,
      "forbidden",
      existing.status !== "payment_anomaly"
        ? "Only payment anomalies can be resolved this way"
        : "Cashiers can resolve only their own anomalies; ask Owner or Administrator",
    );
    return;
  }

  const row = await resolvePaymentAnomaly(orderId, note);
  if (!row) {
    sendError(
      res,
      409,
      "order_not_resolvable",
      "Order is no longer a payment anomaly",
    );
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: row.org_id,
    action: "payment_order.anomaly_resolved",
    metadata: {
      orderId: row.id,
      orderNumber: row.order_number,
      anomalyReason: row.anomaly_reason ?? null,
      note,
    },
  });

  sendJson(res, 200, toPaymentOrder(row));
}

/**
 * GET /v1/orders/{id}/on-chain — watcher facts; same read scope as GET order.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orderId
 */
export async function handleGetPaymentOrderOnChain(req, res, orderId) {
  const row = await loadReadablePaymentOrder(req, res, orderId);
  if (!row) return;
  sendJson(res, 200, toOnChainDetails(row));
}

/**
 * GET /v1/orders/{id}/payment — public guest payload (no session).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orderId
 */
export async function handleGetPaymentOrderPayment(req, res, orderId) {
  const row = await findOrderById(orderId);
  if (!row) {
    sendError(res, 404, "not_found", "Payment link not found");
    return;
  }
  const details = toPaymentDetails(row);
  try {
    const maint = await getEffectiveNetworkMaintenance(row.network);
    if (maint) {
      details.networkMaintenance = {
        message:
          maint.message ||
          `This network is temporarily unavailable${maint.endsAt ? ` until ${new Date(maint.endsAt).toISOString()}` : ""}.`,
        endsAt: maint.endsAt ?? null,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/network_maintenance|does not exist/i.test(message)) {
      sendError(res, 500, "internal_error", "Failed to check network maintenance");
      return;
    }
  }
  sendJson(res, 200, details);
}
