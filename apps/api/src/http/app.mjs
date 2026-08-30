import { getHealthPayload } from "../health-payload.mjs";
import {
  handleForgotPassword,
  handleGetSession,
  handleLogin,
  handleLogout,
  handleMfaEnroll,
  handleMfaVerify,
  handleResetPassword,
  handleChangePassword,
  handlePatchProfile,
} from "./auth-routes.mjs";
import { handleCreateOrg, handleDeleteOrg, handleGetOrg, handleGetOrgDeletePreview, handleListOrgs, handleSetOrgStatus } from "../orgs/org-routes.mjs";
import { handleGetOrgOverview } from "../orgs/org-overview-routes.mjs";
import {
  handleAssignOrgUserRole,
  handleInviteOrgUser,
  handleListOrgUsers,
  handleListOrgMemberEmails,
  handleListPlatformOrgMemberEmails,
  handleRemoveOrgUser,
  handleSetOrgUserStatus,
} from "../orgs/membership-routes.mjs";
import {
  handleCreatePaymentOrder,
  handleCancelPaymentOrder,
  handleResolvePaymentAnomaly,
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
  handleDecideSiteOverride,
  handleListSiteOverrides,
  handleRequestSiteOverride,
} from "../sites/site-override-routes.mjs";
import {
  handleGetRetention,
  handlePutRetention,
} from "../retention/retention-routes.mjs";
import {
  handleDeleteWebhook,
  handleListWebhookDeliveries,
  handleListWebhooks,
  handleRegisterWebhook,
  handleResendWebhookDelivery,
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
import { handleGenerateServiceBills } from "../service-bills/generate-routes.mjs";
import { handleListAuditLog } from "../audit/audit-routes.mjs";
import {
  handleDecideEnterpriseRateApproval,
  handleGetBillingWalletSettings,
  handleGetFeeTierSettings,
  handleGetPlatformOrgPolicy,
  handleListEnterpriseRateApprovals,
  handlePutBillingWalletSettings,
  handlePutFeeTierSettings,
  handlePutPlatformOrgPolicy,
} from "../platform-settings/platform-settings-routes.mjs";
import { handleGetWatcherHealth } from "../ops/watcher-health-routes.mjs";
import {
  handleGetNetworkCatalog,
  handleGetNetworksStatus,
  handleListActiveNetworkMaintenance,
  handlePutNetworkMaintenance,
} from "../platform-settings/network-maintenance-routes.mjs";
import {
  handleApplyComplianceOverride,
  handleListComplianceOverrides,
} from "../compliance/compliance-routes.mjs";
import {
  handleGetMerchantCommercial,
  handlePutMerchantCommercial,
} from "../commercial/merchant-commercial-routes.mjs";
import {
  handleGetAgentPayout,
  handleListAgentPayoutAddresses,
  handlePutAgentPayout,
} from "../commercial/agent-payout-routes.mjs";
import {
  handleGetAgentCommission,
  handleListAgentCommissions,
  handlePutAgentCommission,
} from "../commercial/agent-commission-routes.mjs";
import {
  handleAgentConfirmCommissionPayout,
  handleConfirmCommissionPayoutSent,
  handleGenerateCommissionInvoices,
  handleListCommissionPayouts,
  handleMarkCommissionPayoutPaid,
  handleUpsertCommissionPayout,
} from "../commercial/commission-payout-routes.mjs";
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

  if (method === "PATCH" && path === "/v1/auth/profile") {
    await handlePatchProfile(req, res);
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

  if (method === "POST" && path === "/v1/auth/forgot-password") {
    await handleForgotPassword(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/auth/reset-password") {
    await handleResetPassword(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/auth/change-password") {
    await handleChangePassword(req, res);
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

  const orderCancelMatch = path.match(/^\/v1\/orders\/([^/]+)\/cancel$/);
  if (method === "POST" && orderCancelMatch) {
    await handleCancelPaymentOrder(
      req,
      res,
      decodeURIComponent(orderCancelMatch[1]),
    );
    return;
  }

  const orderResolveAnomalyMatch = path.match(
    /^\/v1\/orders\/([^/]+)\/resolve-anomaly$/,
  );
  if (method === "POST" && orderResolveAnomalyMatch) {
    await handleResolvePaymentAnomaly(
      req,
      res,
      decodeURIComponent(orderResolveAnomalyMatch[1]),
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

  const overrideDecideMatch = path.match(
    /^\/v1\/orgs\/([^/]+)\/setting-overrides\/([^/]+)$/,
  );
  if (overrideDecideMatch && method === "PATCH") {
    await handleDecideSiteOverride(
      req,
      res,
      decodeURIComponent(overrideDecideMatch[1]),
      decodeURIComponent(overrideDecideMatch[2]),
    );
    return;
  }

  const overridesMatch = path.match(/^\/v1\/orgs\/([^/]+)\/setting-overrides$/);
  if (overridesMatch) {
    const orgId = decodeURIComponent(overridesMatch[1]);
    if (method === "GET") {
      await handleListSiteOverrides(req, res, orgId);
      return;
    }
    if (method === "POST") {
      await handleRequestSiteOverride(req, res, orgId);
      return;
    }
  }

  const retentionMatch = path.match(/^\/v1\/orgs\/([^/]+)\/retention$/);
  if (retentionMatch) {
    const orgId = decodeURIComponent(retentionMatch[1]);
    if (method === "GET") {
      await handleGetRetention(req, res, orgId);
      return;
    }
    if (method === "PUT") {
      await handlePutRetention(req, res, orgId);
      return;
    }
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

  if (path === "/v1/commission-payouts") {
    if (method === "GET") {
      await handleListCommissionPayouts(req, res, url);
      return;
    }
    if (method === "POST") {
      await handleUpsertCommissionPayout(req, res);
      return;
    }
  }

  if (method === "POST" && path === "/v1/commission-payouts/generate") {
    await handleGenerateCommissionInvoices(req, res);
    return;
  }

  if (method === "GET" && path === "/v1/agent-commissions") {
    await handleListAgentCommissions(req, res);
    return;
  }

  if (method === "GET" && path === "/v1/agent-payout-addresses") {
    await handleListAgentPayoutAddresses(req, res);
    return;
  }

  const commissionPayoutConfirmMatch = path.match(
    /^\/v1\/commission-payouts\/([^/]+)\/confirm-sent$/,
  );
  if (method === "POST" && commissionPayoutConfirmMatch) {
    await handleConfirmCommissionPayoutSent(
      req,
      res,
      decodeURIComponent(commissionPayoutConfirmMatch[1]),
    );
    return;
  }

  const commissionAgentConfirmMatch = path.match(
    /^\/v1\/commission-payouts\/([^/]+)\/agent-confirm$/,
  );
  if (method === "POST" && commissionAgentConfirmMatch) {
    await handleAgentConfirmCommissionPayout(
      req,
      res,
      decodeURIComponent(commissionAgentConfirmMatch[1]),
    );
    return;
  }

  const commissionPayoutPaidMatch = path.match(
    /^\/v1\/commission-payouts\/([^/]+)\/mark-paid$/,
  );
  if (method === "POST" && commissionPayoutPaidMatch) {
    await handleMarkCommissionPayoutPaid(
      req,
      res,
      decodeURIComponent(commissionPayoutPaidMatch[1]),
    );
    return;
  }

  const webhookDeliveryResendMatch = path.match(
    /^\/v1\/webhooks\/([^/]+)\/deliveries\/([^/]+)\/resend$/,
  );
  if (method === "POST" && webhookDeliveryResendMatch) {
    await handleResendWebhookDelivery(
      req,
      res,
      decodeURIComponent(webhookDeliveryResendMatch[1]),
      decodeURIComponent(webhookDeliveryResendMatch[2]),
      url,
    );
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

  if (path === "/v1/service-bills/generate" && method === "POST") {
    await handleGenerateServiceBills(req, res);
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

  if (path === "/v1/platform/settings/fee-tiers") {
    if (method === "GET") {
      await handleGetFeeTierSettings(req, res);
      return;
    }
    if (method === "PUT") {
      await handlePutFeeTierSettings(req, res);
      return;
    }
  }

  if (path === "/v1/platform/settings/org-policy") {
    if (method === "GET") {
      await handleGetPlatformOrgPolicy(req, res);
      return;
    }
    if (method === "PUT") {
      await handlePutPlatformOrgPolicy(req, res);
      return;
    }
  }

  if (path === "/v1/platform/settings/billing-wallet") {
    if (method === "GET") {
      await handleGetBillingWalletSettings(req, res);
      return;
    }
    if (method === "PUT") {
      await handlePutBillingWalletSettings(req, res);
      return;
    }
  }

  if (path === "/v1/platform/enterprise-rate-approvals" && method === "GET") {
    await handleListEnterpriseRateApprovals(req, res, url);
    return;
  }

  if (path === "/v1/platform/watcher-health" && method === "GET") {
    await handleGetWatcherHealth(req, res);
    return;
  }

  if (path === "/v1/platform/networks/catalog" && method === "GET") {
    await handleGetNetworkCatalog(req, res);
    return;
  }

  if (path === "/v1/networks/status" && method === "GET") {
    await handleGetNetworksStatus(req, res);
    return;
  }

  if (path === "/v1/network-maintenance" && method === "GET") {
    await handleListActiveNetworkMaintenance(req, res);
    return;
  }

  const networkMaintMatch = path.match(
    /^\/v1\/platform\/networks\/([^/]+)\/maintenance$/,
  );
  if (method === "PUT" && networkMaintMatch) {
    await handlePutNetworkMaintenance(
      req,
      res,
      decodeURIComponent(networkMaintMatch[1]),
    );
    return;
  }

  const complianceListMatch = path.match(
    /^\/v1\/platform\/orgs\/([^/]+)\/compliance-overrides$/,
  );
  if (method === "GET" && complianceListMatch) {
    await handleListComplianceOverrides(
      req,
      res,
      decodeURIComponent(complianceListMatch[1]),
    );
    return;
  }

  const complianceApplyMatch = path.match(
    /^\/v1\/platform\/orgs\/([^/]+)\/compliance-override$/,
  );
  if (method === "POST" && complianceApplyMatch) {
    await handleApplyComplianceOverride(
      req,
      res,
      decodeURIComponent(complianceApplyMatch[1]),
    );
    return;
  }

  if (path === "/v1/org-member-emails" && method === "GET") {
    await handleListOrgMemberEmails(req, res, url);
    return;
  }

  if (path === "/v1/platform/org-member-emails" && method === "GET") {
    await handleListOrgMemberEmails(req, res, url);
    return;
  }

  if (path === "/v1/platform/org-emails" && method === "GET") {
    await handleListOrgMemberEmails(req, res, url);
    return;
  }

  const enterpriseApprovalMatch = path.match(
    /^\/v1\/platform\/enterprise-rate-approvals\/([^/]+)$/,
  );
  if (method === "PATCH" && enterpriseApprovalMatch) {
    await handleDecideEnterpriseRateApproval(
      req,
      res,
      decodeURIComponent(enterpriseApprovalMatch[1]),
    );
    return;
  }

  const overviewMatch = path.match(/^\/v1\/orgs\/([^/]+)\/overview$/);
  if (method === "GET" && overviewMatch) {
    await handleGetOrgOverview(req, res, decodeURIComponent(overviewMatch[1]));
    return;
  }

  const commercialMatch = path.match(/^\/v1\/orgs\/([^/]+)\/commercial$/);
  if (commercialMatch) {
    const orgId = decodeURIComponent(commercialMatch[1]);
    if (method === "GET") {
      await handleGetMerchantCommercial(req, res, orgId);
      return;
    }
    if (method === "PUT") {
      await handlePutMerchantCommercial(req, res, orgId);
      return;
    }
  }

  const agentPayoutMatch = path.match(/^\/v1\/orgs\/([^/]+)\/agent-payout$/);
  if (agentPayoutMatch) {
    const orgId = decodeURIComponent(agentPayoutMatch[1]);
    if (method === "GET") {
      await handleGetAgentPayout(req, res, orgId);
      return;
    }
    if (method === "PUT") {
      await handlePutAgentPayout(req, res, orgId);
      return;
    }
  }

  const agentCommissionMatch = path.match(
    /^\/v1\/orgs\/([^/]+)\/agent-commission$/,
  );
  if (agentCommissionMatch) {
    const orgId = decodeURIComponent(agentCommissionMatch[1]);
    if (method === "GET") {
      await handleGetAgentCommission(req, res, orgId);
      return;
    }
    if (method === "PUT") {
      await handlePutAgentCommission(req, res, orgId);
      return;
    }
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

  const statusMatch = path.match(/^\/v1\/orgs\/([^/]+)\/users\/([^/]+)\/status$/);
  if (method === "PUT" && statusMatch) {
    await handleSetOrgUserStatus(
      req,
      res,
      decodeURIComponent(statusMatch[1]),
      decodeURIComponent(statusMatch[2]),
    );
    return;
  }

  const memberMatch = path.match(/^\/v1\/orgs\/([^/]+)\/users\/([^/]+)$/);
  if (method === "DELETE" && memberMatch) {
    await handleRemoveOrgUser(
      req,
      res,
      decodeURIComponent(memberMatch[1]),
      decodeURIComponent(memberMatch[2]),
    );
    return;
  }

  const inviteMatch = path.match(/^\/v1\/orgs\/([^/]+)\/users$/);
  if (inviteMatch) {
    const orgId = decodeURIComponent(inviteMatch[1]);
    if (method === "GET") {
      await handleListOrgUsers(req, res, orgId);
      return;
    }
    if (method === "POST") {
      await handleInviteOrgUser(req, res, orgId);
      return;
    }
  }

  const orgStatusMatch = path.match(/^\/v1\/orgs\/([^/]+)\/status$/);
  if (method === "PUT" && orgStatusMatch) {
    await handleSetOrgStatus(req, res, decodeURIComponent(orgStatusMatch[1]));
    return;
  }

  const orgDeletePreviewMatch = path.match(/^\/v1\/orgs\/([^/]+)\/delete-preview$/);
  if (method === "GET" && orgDeletePreviewMatch) {
    await handleGetOrgDeletePreview(req, res, decodeURIComponent(orgDeletePreviewMatch[1]));
    return;
  }

  const orgMatch = path.match(/^\/v1\/orgs\/([^/]+)$/);
  if (orgMatch) {
    const orgId = decodeURIComponent(orgMatch[1]);
    if (method === "GET") {
      await handleGetOrg(req, res, orgId);
      return;
    }
    if (method === "DELETE") {
      await handleDeleteOrg(req, res, orgId);
      return;
    }
  }

  sendError(res, 404, "not_found", "Not found");
}
