import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web agent M4-31", () => {
  it("routes agent shell at /agent", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    assert.match(app, /\/agent\/\*/);
    assert.match(app, /AgentApp/);
  });

  it("wires read-only service bill subtree views", () => {
    const agent = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.match(agent, /service-bills/);
    assert.match(agent, /ServiceBillsListPage/);
    const list = readFileSync(
      join(root, "src/agent/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /Read-only/i);
    assert.doesNotMatch(list, /issueServiceBill/);
    const detail = readFileSync(
      join(root, "src/agent/ServiceBillDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /ServiceBillInvoiceFace/);
    assert.match(detail, /Agent accounts cannot issue/);
    assert.doesNotMatch(detail, /issueServiceBill|markServiceBillPaid/);
  });

  it("does not expose payment order creation", () => {
    const agent = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.doesNotMatch(agent, /createOrder/);
    assert.doesNotMatch(agent, /CreateOrderPage/);
    assert.doesNotMatch(agent, /CreateOrderModal/);
  });
});

describe("@paymentgate/web agent C6 onboard merchant", () => {
  it("wires merchant wizard with commercial payload", () => {
    const app = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.match(app, /merchants\/new/);
    assert.match(app, /AgentMerchantsRoutes/);
    const wizard = readFileSync(
      join(root, "src/agent/OnboardMerchantPage.tsx"),
      "utf8",
    );
    assert.match(wizard, /Onboard merchant/);
    assert.doesNotMatch(wizard, /New merchant/);
    assert.doesNotMatch(wizard, /stub UI/i);
    assert.match(wizard, /createOrg/);
    assert.match(wizard, /commercial/);
    assert.doesNotMatch(wizard, /createOrder/);
  });
});

describe("@paymentgate/web agent C10 commissions", () => {
  it("wires read-only commission statements separate from service bills", () => {
    const app = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.match(app, /commissions/);
    assert.match(app, /CommissionsPage/);
    const page = readFileSync(join(root, "src/agent/CommissionsPage.tsx"), "utf8");
    assert.match(page, /commissionHistoryFromBills/);
    assert.match(page, /listAgentCommissions/);
    assert.match(page, /getAgentServiceBills/);
    assert.match(page, /parseCommissionsTab/);
    assert.match(page, /From parent agent/);
    assert.match(page, /payeeOrgId: agentId/);
    assert.match(page, /CommissionInvoiceModal/);
    assert.match(page, /generateSubAgentCommissionInvoices/);
    assert.match(page, /Open invoice/);
    assert.match(page, /Issue invoices/);
    assert.doesNotMatch(page, /issueServiceBill/);
    assert.doesNotMatch(page, /createOrder/);
  });
});

describe("@paymentgate/web agent C12 settings", () => {
  it("locks commission payout to USDT on Tron", () => {
    const page = readFileSync(
      join(root, "src/agent/AgentSettingsPage.tsx"),
      "utf8",
    );
    assert.match(page, /PLATFORM_FEE_ASSET/);
    assert.match(page, /platformFeeNetwork/);
    assert.doesNotMatch(page, /uniqueAssetsFromRegistry/);
    assert.doesNotMatch(page, /SearchableSelect/);
  });
});

describe("@paymentgate/web agent C7 merchant detail", () => {
  it("wires tabbed merchant detail with read-only managed-by-merchant labels", () => {
    const detail = readFileSync(
      join(root, "src/agent/MerchantDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /filter-tabs/);
    assert.match(detail, /managed by merchant/i);
    assert.match(detail, /getAgentServiceBills/);
    assert.doesNotMatch(detail, /follow in a later/);

    const api = readFileSync(join(root, "src/agent/api.ts"), "utf8");
    assert.match(api, /orgId/);
  });
});
