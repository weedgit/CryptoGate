import { createHash } from "node:crypto";
import { OrderStatus } from "@cryptogate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { resolveOrderOrgId } from "../orgs/role-policy.mjs";
import { callerCanReadPaymentOrder } from "./order-list-routes.mjs";
import {
  extraCreateOrderKeys,
  idempotencyBodyHashPayload,
  validateCreateOrderBody,
} from "./order-rules.mjs";
import { assignOnOrderCreate } from "./order-matching.mjs";
import {
  findOrderById,
  findOrderByIdempotency,
  insertPaymentOrder,
  toPaymentOrder,
  withCreateOrderLock,
} from "./order-store.mjs";
import { toPaymentDetails } from "./order-map.mjs";
import { getEffectiveMatchingMode } from "../matching-mode/matching-mode-store.mjs";
import { bindHdPoolOrder } from "../mode-s/hd-pool-store.mjs";

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
 * POST /v1/orders — assign via `@cryptogate/matching` (M2-12).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleCreatePaymentOrder(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

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

  const scope = resolveOrderOrgId(caller.memberships, validated.parsed.orgId);
  if (!scope.ok) {
    sendError(res, scope.status, scope.code, scope.message);
    return;
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

  /** @type {{ kind: "created", row: object } | { kind: "replay", row: object } | { kind: "error", status: number, code: string, message: string } | { kind: "conflict" }} */
  let outcome;
  try {
    outcome = await withCreateOrderLock(
      scope.orgId,
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

        const matchingMode = await getEffectiveMatchingMode(scope.orgId, client);
        const assigned = await assignOnOrderCreate({
          client,
          orgId: scope.orgId,
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
            orgId: scope.orgId,
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
  } catch {
    sendError(res, 500, "internal_error", "Could not create payment order");
    return;
  }

  if (outcome.kind === "error") {
    sendError(res, outcome.status, outcome.code, outcome.message);
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
 * GET /v1/orders/{id} — merchant/cashier session. Cross-merchant is 403.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orderId
 */
export async function handleGetPaymentOrder(req, res, orderId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const row = await findOrderById(orderId);
  if (!row) {
    sendError(res, 404, "not_found", "Order not found");
    return;
  }
  if (
    !(await callerCanReadPaymentOrder(caller, {
      orgId: row.org_id,
      createdBy: row.created_by,
    }))
  ) {
    sendError(res, 403, "forbidden", "Outside merchant scope");
    return;
  }
  sendJson(res, 200, toPaymentOrder(row));
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
  sendJson(res, 200, toPaymentDetails(row));
}
