import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@cryptogate/web agent M4-31", () => {
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

describe("@cryptogate/web agent C6 onboard merchant", () => {
  it("wires merchant wizard with commercial payload", () => {
    const app = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.match(app, /merchants\/new/);
    assert.match(app, /OnboardMerchantPage/);
    const wizard = readFileSync(
      join(root, "src/agent/OnboardMerchantPage.tsx"),
      "utf8",
    );
    assert.doesNotMatch(wizard, /stub UI/i);
    assert.match(wizard, /createOrg/);
    assert.match(wizard, /commercial/);
    assert.doesNotMatch(wizard, /createOrder/);
  });
});

describe("@cryptogate/web agent C10 commissions", () => {
  it("wires read-only commission statements separate from service bills", () => {
    const app = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.match(app, /commissions/);
    assert.match(app, /CommissionsPage/);
    const page = readFileSync(join(root, "src/agent/CommissionsPage.tsx"), "utf8");
    assert.match(page, /commissionHistoryFromBills/);
    assert.match(page, /listAgentCommissions/);
    assert.match(page, /View service bills/);
    assert.match(page, /subtree service bills/);
    assert.doesNotMatch(page, /issueServiceBill/);
    assert.doesNotMatch(page, /createOrder/);
  });
});

describe("@cryptogate/web agent C7 merchant detail", () => {
  it("wires tabbed merchant detail with read-only managed-by-merchant labels", () => {
    const detail = readFileSync(
      join(root, "src/agent/MerchantDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /filter-tabs/);
    assert.match(detail, /managed by merchant/i);
    assert.match(detail, /listServiceBills/);
    assert.doesNotMatch(detail, /follow in a later/);

    const api = readFileSync(join(root, "src/agent/api.ts"), "utf8");
    assert.match(api, /orgId/);
  });
});
