import { createHash } from "node:crypto";
import { OrderStatus } from "@cryptogate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { resolveOrderOrgId } from "../orgs/role-policy.mjs";
import {
  extraCreateOrderKeys,
  idempotencyBodyHashPayload,
  stubAssignOnCreate,
  validateCreateOrderBody,
} from "./order-rules.mjs";
import {
  findOrderByIdempotency,
  insertPaymentOrder,
  toPaymentOrder,
} from "./order-store.mjs";

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
 * POST /v1/orders — M1 stub (mock receive address; matching assign is M2-12).
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
  const existing = await findOrderByIdempotency(scope.orgId, idempotencyKey);
  if (existing) {
    if (existing.idempotency_body_hash !== bodyHash) {
      sendError(
        res,
        409,
        "idempotency_conflict",
        "Idempotency-Key was reused with a different body",
      );
      return;
    }
    sendJson(res, 201, toPaymentOrder(existing));
    return;
  }

  const assign = stubAssignOnCreate({
    amount: validated.parsed.amount,
    asset: validated.parsed.asset,
    config: validated.parsed.config,
  });
  const expiresAt = new Date(
    Date.now() + validated.parsed.validitySeconds * 1000,
  );

  const inserted = await insertPaymentOrder({
    orgId: scope.orgId,
    createdBy: caller.userId,
    status: OrderStatus.PendingPayment,
    matchingMode: assign.matchingMode,
    payableAmount: assign.payableAmount.amount,
    receiveAddress: assign.receiveAddress,
    addressSource: assign.addressSource,
    hdIndex: assign.hdIndex,
    memoOrTag: assign.memoOrTag,
    asset: validated.parsed.asset,
    network: validated.parsed.network,
    expiresAt,
    requiredConfirmations: assign.requiredConfirmations,
    idempotencyKey,
    idempotencyBodyHash: bodyHash,
    merchantMetadata: validated.parsed.merchantMetadata,
  });

  if (!inserted.ok) {
    const raced = await findOrderByIdempotency(scope.orgId, idempotencyKey);
    if (raced && raced.idempotency_body_hash === bodyHash) {
      sendJson(res, 201, toPaymentOrder(raced));
      return;
    }
    sendError(
      res,
      409,
      "idempotency_conflict",
      "Idempotency-Key was reused with a different body",
    );
    return;
  }

  sendJson(res, 201, toPaymentOrder(inserted.row));
}
