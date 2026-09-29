import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** SettlementPage plus its split-out cards under src/merchant/settlement/. */
function readSettlementSources() {
  const dir = join(root, "src/merchant/settlement");
  return [
    readFileSync(join(root, "src/merchant/SettlementPage.tsx"), "utf8"),
    readFileSync(join(root, "src/platform/MerchantSettlementPanel.tsx"), "utf8"),
    ...readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")),
  ].join("\n");
}

/** OrderDetailPage plus its split-out sections under src/merchant/orderDetail/. */
function readOrderDetailSources() {
  const dir = join(root, "src/merchant/orderDetail");
  return [
    readFileSync(join(root, "src/merchant/OrderDetailPage.tsx"), "utf8"),
    ...readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")),
  ].join("\n");
}

describe("@paymentgate/web merchant M2-60", () => {
  it("has create-order route and matching labels", () => {
    const labels = readFileSync(
      join(root, "src/merchant/matchingLabels.ts"),
      "utf8",
    );
    assert.match(labels, /Standard/);
    assert.match(labels, /Amount fingerprint/);
    assert.match(labels, /Smart address/);
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /orders\/\*/);
    const routes = readFileSync(
      join(root, "src/merchant/MerchantOrdersRoutes.tsx"),
      "utf8",
    );
    assert.match(routes, /orders\/new/);
    assert.match(routes, /merchantRoute\("charge"\)/);
    assert.equal(existsSync(join(root, "src/merchant/CreateOrderModal.tsx")), false);
    assert.match(app, /function ChargeTerminalLayout/);
    assert.match(app, /backTo=\{backTo\}/);
    assert.match(app, /<Route path="charge" element=\{<PayPadPage session=\{session\} \/>\} \/>/);
    const pad = readFileSync(join(root, "src/merchant/cashier/PayPadPage.tsx"), "utf8");
    assert.match(pad, /createOrder/);
    assert.doesNotMatch(pad, /Mark paid/i);
  });

  it("ignores pink animation sticky from Figma", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.doesNotMatch(app, /Input focus glow/);
    assert.doesNotMatch(app, /ff5a6a.*sparkles/i);
  });
});

describe("@paymentgate/web merchant M2-61/62/63 settlement", () => {
  it("wires settlement route and org APIs", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /settings\/settlement/);
    assert.match(app, /SettlementPage/);
    const page = readSettlementSources();
    assert.match(page, /new orders only/i);
    assert.match(page, /putMatchingMode/);
    assert.match(page, /putFulfillmentPolicy/);
    assert.match(page, /putSettlement/);
    assert.match(page, /putXpub/);
    assert.match(page, /listHdPool/);
    assert.match(page, /mfaCode|MFA/);
    assert.doesNotMatch(page, /private key|mnemonic/i);
  });

  it("exposes product matching labels on mode cards", () => {
    const labels = readFileSync(
      join(root, "src/merchant/matchingLabels.ts"),
      "utf8",
    );
    assert.match(labels, /MATCHING_MODE_CARDS/);
    assert.match(labels, /Smart address/);
    assert.doesNotMatch(labels, /mode: "D"/);
    assert.match(labels, /matchingModeCardDisabled/);
    assert.match(labels, /MODE_D_PHASE1_UNAVAILABLE_REASON/);
    const settlement = readSettlementSources();
    assert.match(settlement, /matchingModeCardDisabled/);
    assert.match(settlement, /is-unavailable/);
  });
});

describe("@paymentgate/web merchant D1-D3 orders shell", () => {
  it("wires dashboard, list, and detail routes", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /path="orders\/\*"/);
    assert.match(app, /MerchantOrdersRoutes/);
    assert.match(app, /DashboardPage/);
    const routes = readFileSync(
      join(root, "src/merchant/MerchantOrdersRoutes.tsx"),
      "utf8",
    );
    assert.match(routes, /OrdersListPage/);
    assert.match(routes, /OrderDetailPage/);
    assert.match(routes, /orderId=\{orderId\}/);
    const detail = readFileSync(
      join(root, "src/merchant/OrderDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /paymentOrderIdFromRoute/);
    assert.match(detail, /params\.orderId/);
    assert.match(app, /Navigate to=\{merchantRoute\(\)\}/);
  });

  it("lists and exports orders via API helpers", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listOrders/);
    assert.match(api, /getOrder/);
    assert.match(api, /getOnChain/);
    assert.match(api, /ordersCsvUrl/);
  });

  it("uses canonical status labels and never Mark paid", () => {
    const status = readFileSync(
      join(root, "src/merchant/orderStatus.ts"),
      "utf8",
    );
    assert.match(status, /Pending Payment/);
    assert.match(status, /Attention/);
    assert.doesNotMatch(status, /:\s*"Paid"/);
    const detail = readOrderDetailSources();
    assert.doesNotMatch(detail, /<button[^>]*>[^<]*Mark paid/i);
    assert.match(detail, /order-detail-anomaly/);
    assert.match(detail, /"Resolve"/);
    assert.match(detail, /resolveOrderAnomaly/);
    assert.match(detail, /listWebhookDeliveries/);
    assert.match(detail, /resendWebhookDelivery/);
  });
});

describe("@paymentgate/web merchant D17 cashier shell", () => {
  it("limits nav and guards owner-only routes for cashiers", () => {
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.doesNotMatch(shell, /showCashierBanner|CashierRestrictedBanner|CASHIER_GROUPS/);
    assert.match(shell, /SidebarRoleCard/);
    const cashierShell = readFileSync(
      join(root, "src/merchant/cashier/CashierShell.tsx"),
      "utf8",
    );
    assert.match(cashierShell, /Cashier terminal/);
    assert.match(cashierShell, /label: "Charge"/);
    assert.match(cashierShell, /label: "My shift"/);
    assert.doesNotMatch(cashierShell, /service-bills|settlement|xpub/i);

    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /RequireOwnerPortal/);
    assert.match(app, /CashierForbiddenPage/);

    const org = readFileSync(join(root, "src/merchant/org.ts"), "utf8");
    assert.match(org, /sessionIsCashierOnly/);
  });

  it("shows cashier limits in the sidebar role card", () => {
    const perms = readFileSync(join(root, "src/shared/rolePermissions.ts"), "utf8");
    assert.match(perms, /Own orders only/);
    assert.match(perms, /Hidden for Cashiers/);
  });
});

describe("@paymentgate/web merchant D5-D6 service bills", () => {
  it("wires service bill list and detail routes", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /ServiceBillsListPage/);
    assert.match(app, /ServiceBillDetailPage/);
    assert.match(app, /path="service-bills"/);
  });

  it("uses separate service bill API and status labels", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listServiceBills/);
    assert.match(api, /getServiceBillCheckout/);
    const labels = readFileSync(
      join(root, "src/merchant/serviceBillStatus.ts"),
      "utf8",
    );
    assert.match(labels, /overdue/);
    assert.doesNotMatch(labels, /pending_payment/);
    const list = readFileSync(
      join(root, "src/merchant/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /listServiceBills/);
    assert.match(list, /Bills by month/);
    assert.doesNotMatch(list, /createOrder|listOrders/);
    const detail = readFileSync(
      join(root, "src/merchant/ServiceBillDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /PlatformServiceBillDetailPage/);
    assert.match(detail, /ServiceBillsPortalContext/);
    const portal = readFileSync(
      join(root, "src/merchant/useMerchantServiceBillsPortal.tsx"),
      "utf8",
    );
    assert.match(portal, /kind: "merchant"/);
    assert.match(portal, /getServiceBillCheckout/);
    assert.match(portal, /sessionCanCheckoutServiceBill/);
    const shared = readFileSync(
      join(root, "src/platform/ServiceBillDetailPage.tsx"),
      "utf8",
    );
    assert.match(shared, /ServiceBillInvoiceFace/);
    assert.match(shared, /portal\?\.loadCheckout/);
    assert.match(shared, /qrPayload: checkout\?\.qrPayload/);
  });
});

describe("@paymentgate/web merchant D14 integrations", () => {
  it("wires integrations route and API helpers", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /settings\/integrations"\s*element=\{<Navigate to=\{merchantRoute\("networks"\)\}/);
    const networks = readFileSync(join(root, "src/merchant/NetworksPage.tsx"), "utf8");
    assert.match(networks, /<IntegrationsPage session=\{session\} \/>/);
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listApiKeys/);
    assert.match(api, /registerWebhook/);
    assert.match(api, /testWebhook/);
    assert.match(api, /listWebhookDeliveries/);
    assert.match(api, /resendWebhookDelivery/);
  });

  it("shows secrets once and blocks cashiers via owner portal", () => {
    const page = readFileSync(join(root, "src/merchant/IntegrationsPage.tsx"), "utf8");
    assert.match(page, /One-time display/i);
    assert.match(page, /cannot be retrieved/i);
    assert.match(page, /resendWebhookDelivery/);
    assert.match(page, /SecretOnceModal/);
    assert.match(page, /Cashier accounts/i);
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.doesNotMatch(shell, /settings\/integrations|IntegrationsNavIcon/);
  });
});

describe("@paymentgate/web merchant reports folded into dashboard", () => {
  it("redirects legacy /reports and drops the nav tab", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.doesNotMatch(app, /ReportsPage/);
    assert.match(app, /path="reports\/\*" element=\{<Navigate/);
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.doesNotMatch(shell, /label: "Reports"/);
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /ordersCsvUrl\(opts\?/);
  });

  it("dashboard shows per-cashier totals linked to filtered invoices", () => {
    const page = readFileSync(join(root, "src/merchant/DashboardPage.tsx"), "utf8");
    assert.match(page, /getDashboardReports/);
    assert.match(page, /byCreator/);
    assert.match(page, /cashier: userId/);
    assert.doesNotMatch(page, /listAllOrders|volumeForOrder/);
  });
});

describe("@paymentgate/web merchant D12-D16 settings", () => {
  it("wires team, notifications, and legacy org/billing redirects", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /NotificationsSettingsPage/);
    assert.match(app, /TeamSettingsPage/);
    assert.match(app, /RequireMerchantPortal/);
    assert.match(app, /settings\/organization/);
    assert.match(app, /settings\/billing/);
    assert.match(app, /Navigate to=\{merchantRoute\("settings\/team"\)\}/);
    assert.match(app, /Navigate to=\{merchantRoute\("service-bills"\)\}/);
    assert.match(app, /settings\/notifications/);
    assert.match(app, /settings\/team/);
    assert.doesNotMatch(app, /OrganizationSettingsPage/);
  });

  it("uses org API helpers and owner-only team management", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listOrgs/);
    assert.match(api, /getOrg/);
    assert.match(api, /inviteOrgUser/);
    assert.match(api, /assignOrgUserRole/);
    const team = readFileSync(join(root, "src/merchant/TeamSettingsPage.tsx"), "utf8");
    assert.match(team, /sessionCanManageTeam/);
    const perms = readFileSync(join(root, "src/shared/rolePermissions.ts"), "utf8");
    assert.match(perms, /Add or remove team members/);
    assert.match(team, /inviteOrgUser/);
    assert.match(team, /inviteRoleOptions/);
    const org = readFileSync(join(root, "src/merchant/org.ts"), "utf8");
    assert.match(org, /sessionIsMerchantStaff/);
    assert.doesNotMatch(org, /orgType == null/);
    assert.match(team, /plat-team plat-bills/);
    assert.match(team, /plat-bills__intro-title/);
    const bills = readFileSync(
      join(root, "src/merchant/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(bills, /not deducted from payer on-chain/i);
    assert.match(bills, /getMerchantCommercial/);
  });
});

describe("@paymentgate/web merchant D7-D9 sites", () => {
  it("wires sites list, create, and detail routes", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    const routes = readFileSync(
      join(root, "src/merchant/MerchantSitesRoutes.tsx"),
      "utf8",
    );
    assert.match(app, /MerchantSitesRoutes/);
    assert.match(app, /path="sites\/:id"/);
    assert.match(routes, /CreateSiteModal/);
    assert.match(routes, /sites\/new/);
  });

  it("uses the shared Platform Accounts page scoped to the merchant", () => {
    const routes = readFileSync(
      join(root, "src/merchant/MerchantSitesRoutes.tsx"),
      "utf8",
    );
    assert.match(routes, /AccountsPage/);
    assert.match(routes, /AccountsPortalContext\.Provider/);
    assert.match(routes, /kind: "merchant"/);
    assert.match(routes, /sitesInMerchantSubtree/);
    assert.match(routes, /canEditAgentPayout: \(\) => false/);
  });

  it("creates merchant_site via org API", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /createOrg/);
    assert.match(api, /deleteOrg/);
    const create = readFileSync(join(root, "src/merchant/CreateSiteModal.tsx"), "utf8");
    assert.match(create, /merchant_site/);
    assert.match(create, /inherit/i);
    assert.match(create, /b3-commission-modal/);
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.doesNotMatch(shell, /showCashierBanner|CashierRestrictedBanner|CASHIER_GROUPS/);
    assert.match(shell, /SidebarRoleCard/);
    const cashierShell = readFileSync(
      join(root, "src/merchant/cashier/CashierShell.tsx"),
      "utf8",
    );
    assert.match(cashierShell, /Cashier terminal/);
    assert.match(cashierShell, /label: "Charge"/);
    assert.match(cashierShell, /label: "My shift"/);
    assert.doesNotMatch(cashierShell, /service-bills|settlement|xpub/i);

    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /RequireOwnerPortal/);
    assert.match(app, /CashierForbiddenPage/);

    const org = readFileSync(join(root, "src/merchant/org.ts"), "utf8");
    assert.match(org, /sessionIsCashierOnly/);
  });

  it("shows cashier limits in the sidebar role card", () => {
    const perms = readFileSync(join(root, "src/shared/rolePermissions.ts"), "utf8");
    assert.match(perms, /Own orders only/);
    assert.match(perms, /Hidden for Cashiers/);
  });
});

describe("@paymentgate/web merchant D5-D6 service bills", () => {
  it("wires service bill list and detail routes", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /ServiceBillsListPage/);
    assert.match(app, /ServiceBillDetailPage/);
    assert.match(app, /path="service-bills"/);
  });

  it("uses separate service bill API and status labels", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listServiceBills/);
    assert.match(api, /getServiceBillCheckout/);
    const labels = readFileSync(
      join(root, "src/merchant/serviceBillStatus.ts"),
      "utf8",
    );
    assert.match(labels, /overdue/);
    assert.doesNotMatch(labels, /pending_payment/);
    const list = readFileSync(
      join(root, "src/merchant/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /listServiceBills/);
    assert.match(list, /Bills by month/);
    assert.doesNotMatch(list, /createOrder|listOrders/);
    const detail = readFileSync(
      join(root, "src/merchant/ServiceBillDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /PlatformServiceBillDetailPage/);
    assert.match(detail, /ServiceBillsPortalContext/);
    const portal = readFileSync(
      join(root, "src/merchant/useMerchantServiceBillsPortal.tsx"),
      "utf8",
    );
    assert.match(portal, /kind: "merchant"/);
    assert.match(portal, /getServiceBillCheckout/);
    assert.match(portal, /sessionCanCheckoutServiceBill/);
    const shared = readFileSync(
      join(root, "src/platform/ServiceBillDetailPage.tsx"),
      "utf8",
    );
    assert.match(shared, /ServiceBillInvoiceFace/);
    assert.match(shared, /portal\?\.loadCheckout/);
    assert.match(shared, /qrPayload: checkout\?\.qrPayload/);
  });
});

describe("@paymentgate/web merchant D14 integrations", () => {
  it("wires integrations route and API helpers", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /settings\/integrations"\s*element=\{<Navigate to=\{merchantRoute\("networks"\)\}/);
    const networks = readFileSync(join(root, "src/merchant/NetworksPage.tsx"), "utf8");
    assert.match(networks, /<IntegrationsPage session=\{session\} \/>/);
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listApiKeys/);
    assert.match(api, /registerWebhook/);
    assert.match(api, /testWebhook/);
    assert.match(api, /listWebhookDeliveries/);
    assert.match(api, /resendWebhookDelivery/);
  });

  it("shows secrets once and blocks cashiers via owner portal", () => {
    const page = readFileSync(join(root, "src/merchant/IntegrationsPage.tsx"), "utf8");
    assert.match(page, /One-time display/i);
    assert.match(page, /cannot be retrieved/i);
    assert.match(page, /resendWebhookDelivery/);
    assert.match(page, /SecretOnceModal/);
    assert.match(page, /Cashier accounts/i);
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.doesNotMatch(shell, /settings\/integrations|IntegrationsNavIcon/);
  });
});

describe("@paymentgate/web merchant reports folded into dashboard", () => {
  it("redirects legacy /reports and drops the nav tab", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.doesNotMatch(app, /ReportsPage/);
    assert.match(app, /path="reports\/\*" element=\{<Navigate/);
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.doesNotMatch(shell, /label: "Reports"/);
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /ordersCsvUrl\(opts\?/);
  });

  it("dashboard shows per-cashier totals linked to filtered invoices", () => {
    const page = readFileSync(join(root, "src/merchant/DashboardPage.tsx"), "utf8");
    assert.match(page, /getDashboardReports/);
    assert.match(page, /byCreator/);
    assert.match(page, /cashier: userId/);
    assert.doesNotMatch(page, /listAllOrders|volumeForOrder/);
  });
});

describe("@paymentgate/web merchant D12-D16 settings", () => {
  it("wires team, notifications, and legacy org/billing redirects", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /NotificationsSettingsPage/);
    assert.match(app, /TeamSettingsPage/);
    assert.match(app, /RequireMerchantPortal/);
    assert.match(app, /settings\/organization/);
    assert.match(app, /settings\/billing/);
    assert.match(app, /Navigate to=\{merchantRoute\("settings\/team"\)\}/);
    assert.match(app, /Navigate to=\{merchantRoute\("service-bills"\)\}/);
    assert.match(app, /settings\/notifications/);
    assert.match(app, /settings\/team/);
    assert.doesNotMatch(app, /OrganizationSettingsPage/);
  });

  it("uses org API helpers and owner-only team management", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listOrgs/);
    assert.match(api, /getOrg/);
    assert.match(api, /inviteOrgUser/);
    assert.match(api, /assignOrgUserRole/);
    const team = readFileSync(join(root, "src/merchant/TeamSettingsPage.tsx"), "utf8");
    assert.match(team, /sessionCanManageTeam/);
    const perms = readFileSync(join(root, "src/shared/rolePermissions.ts"), "utf8");
    assert.match(perms, /Add or remove team members/);
    assert.match(team, /inviteOrgUser/);
    assert.match(team, /inviteRoleOptions/);
    const org = readFileSync(join(root, "src/merchant/org.ts"), "utf8");
    assert.match(org, /sessionIsMerchantStaff/);
    assert.doesNotMatch(org, /orgType == null/);
    assert.match(team, /plat-team plat-bills/);
    assert.match(team, /plat-bills__intro-title/);
    const bills = readFileSync(
      join(root, "src/merchant/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(bills, /not deducted from payer on-chain/i);
    assert.match(bills, /getMerchantCommercial/);
  });
});

describe("@paymentgate/web merchant D7-D9 sites", () => {
  it("wires sites list, create, and detail routes", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    const routes = readFileSync(
      join(root, "src/merchant/MerchantSitesRoutes.tsx"),
      "utf8",
    );
    assert.match(app, /MerchantSitesRoutes/);
    assert.match(app, /path="sites\/:id"/);
    assert.match(routes, /CreateSiteModal/);
    assert.match(routes, /sites\/new/);
  });

  it("uses the shared Platform Accounts page scoped to the merchant", () => {
    const routes = readFileSync(
      join(root, "src/merchant/MerchantSitesRoutes.tsx"),
      "utf8",
    );
    assert.match(routes, /AccountsPage/);
    assert.match(routes, /AccountsPortalContext\.Provider/);
    assert.match(routes, /kind: "merchant"/);
    assert.match(routes, /sitesInMerchantSubtree/);
    assert.match(routes, /canEditAgentPayout: \(\) => false/);
  });

  it("creates merchant_site via org API", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /createOrg/);
    assert.match(api, /deleteOrg/);
    const create = readFileSync(join(root, "src/merchant/CreateSiteModal.tsx"), "utf8");
    assert.match(create, /merchant_site/);
    assert.match(create, /inherit/i);
    assert.match(create, /b3-commission-modal/);
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.match(shell, /logo-badge--location/);
    assert.match(shell, /sessionLocationKind/);
    const org = readFileSync(join(root, "src/merchant/org.ts"), "utf8");
    assert.match(org, /export function sessionLocationKind/);
    assert.match(org, /return \"Merchant\"/);
    assert.match(org, /return \"Site\"/);
    assert.doesNotMatch(org, /single_location|multi_location/);
    const createHint = readFileSync(
      join(root, "src/merchant/CreateSiteModal.tsx"),
      "utf8",
    );
    assert.match(createHint, /inherit from the\s+parent merchant/);
    assert.doesNotMatch(createHint, /approves a site override/);
  });
});

describe("Charge page (merchant + cashier)", () => {
  it("charges in $ USD, € EUR, or the pay-with token via one toggle", () => {
    const src = readFileSync(join(root, "src/merchant/cashier/PayPadPage.tsx"), "utf8");
    assert.doesNotMatch(src, /<select\b/);
    assert.match(src, /aria-label="Charge in"/);
    assert.match(src, /\(\["USD", "EUR", "TOKEN"\] as const\)/);
    assert.match(src, /amountCrypto: trimmed, invoiceDenomination: "crypto"/);
    assert.match(src, /Customer pays exactly/);
  });

  it("returns to the page Charge was opened from", () => {
    const link = readFileSync(join(root, "src/merchant/chargeLink.tsx"), "utf8");
    assert.match(link, /chargeReturnTo: `\$\{location\.pathname\}\$\{location\.search\}`/);
    assert.match(link, /sessionStorage\.setItem\(RETURN_KEY, from\)/);
    assert.match(link, /\(charge\|pay\\\/\)/);
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /const backTo = useChargeReturnTo\(\);/);
    for (const file of [
      "src/merchant/SiteHomePage.tsx",
      "src/merchant/orderDetail/OrderDetailHeader.tsx",
      "src/shared/invoiceList/InvoiceListHeader.tsx",
    ]) {
      const src = readFileSync(join(root, file), "utf8");
      assert.match(src, /<ChargeLink className=/, file);
      assert.doesNotMatch(src, /to=\{merchantRoute\("charge"\)\}/, file);
    }
  });

  it("offers a Valid for menu and reference for every role", () => {
    const src = readFileSync(join(root, "src/merchant/cashier/PayPadPage.tsx"), "utf8");
    assert.match(src, /Valid for/);
    assert.match(src, /role="listbox"/);
    assert.match(src, /VALIDITY_OPTIONS\.map/);
    assert.match(src, /validitySeconds,/);
    assert.match(src, /Reference \(optional\)/);
    assert.doesNotMatch(src, /role === "owner"|sessionCanManage/);
  });

  it("sends the payment page link from the live screen and order detail", () => {
    const share = readFileSync(join(root, "src/shared/SharePayLink.tsx"), "utf8");
    assert.match(share, /navigator\.share/);
    assert.match(share, /https:\/\/wa\.me\/\?text=/);
    assert.match(share, /https:\/\/t\.me\/share\/url/);
    assert.match(share, /mailto:/);
    assert.match(share, /sms:/);
    assert.match(share, /share-pay-link__url-text/);
    assert.match(share, /Open link/);
    assert.doesNotMatch(share, />\s*Copy link\s*</);
    const live = readFileSync(join(root, "src/merchant/cashier/LivePaymentPage.tsx"), "utf8");
    assert.match(live, /phase === "waiting" && pay\?\.paymentPageUrl \? \(\s*<SharePayLink/);
    const head = readFileSync(join(root, "src/merchant/orderDetail/OrderDetailHeader.tsx"), "utf8");
    assert.match(head, /<SharePayLink/);
    assert.match(head, /order\.status === "pending_payment"/);
    const rail = readFileSync(join(root, "src/merchant/orderDetail/OrderRailActions.tsx"), "utf8");
    assert.doesNotMatch(rail, /<SharePayLink/);
  });

  it("explains Standard matching in plain words", () => {
    const labels = readFileSync(join(root, "src/merchant/matchingLabels.ts"), "utf8");
    assert.match(labels, /Customers pay to your main wallet\. Only one open order per amount at a time\./);
    assert.match(labels, /Need the same amount again\? Wait until the first order is paid, expires, or is cancelled\./);
    assert.doesNotMatch(labels, /residual match collisions|second create is blocked/);
  });
});
