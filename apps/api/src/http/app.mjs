import { getHealthPayload } from "../health-payload.mjs";
import {
  handleGetSession,
  handleLogin,
  handleLogout,
  handleMfaEnroll,
  handleMfaVerify,
} from "./auth-routes.mjs";
import { handleCreateOrg, handleGetOrg, handleListOrgs } from "../orgs/org-routes.mjs";
import {
  handleAssignOrgUserRole,
  handleInviteOrgUser,
} from "../orgs/membership-routes.mjs";
import {
  handleCreatePaymentOrder,
  handleGetPaymentOrder,
  handleGetPaymentOrderOnChain,
  handleGetPaymentOrderPayment,
} from "../orders/order-routes.mjs";
import { handleListPaymentOrders } from "../orders/order-list-routes.mjs";
import {
  handleGetSettlement,
  handlePutSettlement,
} from "../settlement/settlement-routes.mjs";
import {
  handleGetMatchingMode,
  handlePutMatchingMode,
} from "../matching-mode/matching-mode-routes.mjs";
import { handleGetXpub, handlePutXpub } from "../xpub/xpub-routes.mjs";
import { handleGetHdPool } from "../mode-s/hd-pool-routes.mjs";
import {
  handleDeleteWebhook,
  handleListWebhookDeliveries,
  handleListWebhooks,
  handleRegisterWebhook,
  handleTestWebhook,
} from "../webhooks/webhook-routes.mjs";
import {
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  handleRotateApiKey,
} from "../api-keys/api-key-routes.mjs";
import {
  handleGetServiceBill,
  handleGetServiceBillCheckout,
  handleIssueServiceBill,
  handleListServiceBills,
  handleUpdateServiceBill,
} from "../service-bills/service-bill-routes.mjs";
import { handleListAuditLog } from "../audit/audit-routes.mjs";
import { applyCorsHeaders, handleCorsPreflight } from "./cors.mjs";
import { sendError, sendJson } from "./json.mjs";
import { applyRateLimits } from "../rate-limit/apply-rate-limits.mjs";

/**
 * HTTP router for apps/api. Auth paths match OpenAPI servers.url `/v1`.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleRequest(req, res) {
  applyCorsHeaders(req, res);
  if (handleCorsPreflight(req, res)) return;

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (applyRateLimits(req, res, { method, path })) return;

  if (method === "GET" && path === "/health") {
    const payload = await getHealthPayload({ checkDb: true });
    const code = payload.status === "ok" ? 200 : 503;
    sendJson(res, code, payload);
    return;
  }

  if (method === "GET" && path === "/") {
    sendJson(res, 200, { service: "cryptogate-api", health: "/health" });
    return;
  }

  if (method === "POST" && path === "/v1/auth/login") {
    await handleLogin(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/auth/logout") {
    await handleLogout(req, res);
    return;
  }

  if (method === "GET" && path === "/v1/auth/session") {
    await handleGetSession(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/auth/mfa/enroll") {
    await handleMfaEnroll(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/auth/mfa/verify") {
    await handleMfaVerify(req, res);
    return;
  }

  if (method === "GET" && path === "/v1/orgs") {
    await handleListOrgs(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/orgs") {
    await handleCreateOrg(req, res);
    return;
  }

  if (path === "/v1/orders") {
    if (method === "POST") {
      await handleCreatePaymentOrder(req, res);
      return;
    }
    if (method === "GET") {
      await handleListPaymentOrders(req, res);
      return;
    }
  }

  const paymentMatch = path.match(/^\/v1\/orders\/([^/]+)\/payment$/);
  if (method === "GET" && paymentMatch) {
    await handleGetPaymentOrderPayment(
      req,
      res,
      decodeURIComponent(paymentMatch[1]),
    );
    return;
  }

  const onChainMatch = path.match(/^\/v1\/orders\/([^/]+)\/on-chain$/);
  if (method === "GET" && onChainMatch) {
    await handleGetPaymentOrderOnChain(
      req,
      res,
      decodeURIComponent(onChainMatch[1]),
    );
    return;
  }

  const orderMatch = path.match(/^\/v1\/orders\/([^/]+)$/);
  if (method === "GET" && orderMatch) {
    await handleGetPaymentOrder(req, res, decodeURIComponent(orderMatch[1]));
    return;
  }

  const settlementMatch = path.match(/^\/v1\/orgs\/([^/]+)\/settlement$/);
  if (settlementMatch) {
    const orgId = decodeURIComponent(settlementMatch[1]);
    if (method === "GET") {
      await handleGetSettlement(req, res, orgId);
      return;
    }
    if (method === "PUT") {
      await handlePutSettlement(req, res, orgId);
      return;
    }
  }

  const matchingModeMatch = path.match(/^\/v1\/orgs\/([^/]+)\/matching-mode$/);
  if (matchingModeMatch) {
    const orgId = decodeURIComponent(matchingModeMatch[1]);
    if (method === "GET") {
      await handleGetMatchingMode(req, res, orgId);
      return;
    }
    if (method === "PUT") {
      await handlePutMatchingMode(req, res, orgId);
      return;
    }
  }

  const xpubMatch = path.match(/^\/v1\/orgs\/([^/]+)\/xpub$/);
  if (xpubMatch) {
    const orgId = decodeURIComponent(xpubMatch[1]);
    if (method === "GET") {
      await handleGetXpub(req, res, orgId);
      return;
    }
    if (method === "PUT") {
      await handlePutXpub(req, res, orgId);
      return;
    }
  }

  const hdPoolMatch = path.match(/^\/v1\/orgs\/([^/]+)\/hd-pool$/);
  if (method === "GET" && hdPoolMatch) {
    await handleGetHdPool(req, res, decodeURIComponent(hdPoolMatch[1]));
    return;
  }

  if (path === "/v1/api-keys") {
    if (method === "GET") {
      await handleListApiKeys(req, res, url);
      return;
    }
    if (method === "POST") {
      await handleCreateApiKey(req, res);
      return;
    }
  }

  const apiKeyRotateMatch = path.match(/^\/v1\/api-keys\/([^/]+)\/rotate$/);
  if (method === "POST" && apiKeyRotateMatch) {
    await handleRotateApiKey(
      req,
      res,
      decodeURIComponent(apiKeyRotateMatch[1]),
      url,
    );
    return;
  }

  const apiKeyMatch = path.match(/^\/v1\/api-keys\/([^/]+)$/);
  if (method === "DELETE" && apiKeyMatch) {
    await handleRevokeApiKey(
      req,
      res,
      decodeURIComponent(apiKeyMatch[1]),
      url,
    );
    return;
  }

  if (path === "/v1/webhooks") {
    if (method === "GET") {
      await handleListWebhooks(req, res, url);
      return;
    }
    if (method === "POST") {
      await handleRegisterWebhook(req, res);
      return;
    }
  }

  if (method === "POST" && path === "/v1/webhooks/test") {
    await handleTestWebhook(req, res, url);
    return;
  }

  const webhookDeliveriesMatch = path.match(
    /^\/v1\/webhooks\/([^/]+)\/deliveries$/,
  );
  if (method === "GET" && webhookDeliveriesMatch) {
    await handleListWebhookDeliveries(
      req,
      res,
      decodeURIComponent(webhookDeliveriesMatch[1]),
      url,
    );
    return;
  }

  const webhookMatch = path.match(/^\/v1\/webhooks\/([^/]+)$/);
  if (method === "DELETE" && webhookMatch) {
    await handleDeleteWebhook(
      req,
      res,
      decodeURIComponent(webhookMatch[1]),
      url,
    );
    return;
  }

  if (path === "/v1/service-bills") {
    if (method === "GET") {
      await handleListServiceBills(req, res, url);
      return;
    }
    if (method === "POST") {
      await handleIssueServiceBill(req, res);
      return;
    }
  }

  if (path === "/v1/audit" && method === "GET") {
    await handleListAuditLog(req, res, url);
    return;
  }

  const serviceBillCheckoutMatch = path.match(
    /^\/v1\/service-bills\/([^/]+)\/checkout$/,
  );
  if (method === "GET" && serviceBillCheckoutMatch) {
    await handleGetServiceBillCheckout(
      req,
      res,
      decodeURIComponent(serviceBillCheckoutMatch[1]),
    );
    return;
  }

  const serviceBillMatch = path.match(/^\/v1\/service-bills\/([^/]+)$/);
  if (serviceBillMatch) {
    const billId = decodeURIComponent(serviceBillMatch[1]);
    if (method === "GET") {
      await handleGetServiceBill(req, res, billId);
      return;
    }
    if (method === "PATCH") {
      await handleUpdateServiceBill(req, res, billId);
      return;
    }
  }

  const roleMatch = path.match(/^\/v1\/orgs\/([^/]+)\/users\/([^/]+)\/role$/);
  if (method === "PUT" && roleMatch) {
    await handleAssignOrgUserRole(
      req,
      res,
      decodeURIComponent(roleMatch[1]),
      decodeURIComponent(roleMatch[2]),
    );
    return;
  }

  const inviteMatch = path.match(/^\/v1\/orgs\/([^/]+)\/users$/);
  if (method === "POST" && inviteMatch) {
    await handleInviteOrgUser(req, res, decodeURIComponent(inviteMatch[1]));
    return;
  }

  const orgMatch = path.match(/^\/v1\/orgs\/([^/]+)$/);
  if (method === "GET" && orgMatch) {
    await handleGetOrg(req, res, decodeURIComponent(orgMatch[1]));
    return;
  }

  sendError(res, 404, "not_found", "Not found");
}
