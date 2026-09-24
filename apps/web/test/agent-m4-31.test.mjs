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
    assert.match(wizard, /ownerOnboardEmailConflict/);
    assert.match(wizard, /inviteOrgUser/);
    assert.doesNotMatch(wizard, /createOrder/);
  });

  it("wires agent sites/new onboard under merchant", () => {
    const app = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.match(app, /sites\/new/);
    const routes = readFileSync(
      join(root, "src/agent/AgentMerchantsRoutes.tsx"),
      "utf8",
    );
    assert.match(routes, /OnboardSitePage/);
    assert.match(routes, /sites\/new/);
    const page = readFileSync(
      join(root, "src/agent/OnboardSitePage.tsx"),
      "utf8",
    );
    assert.match(page, /parentId/);
    assert.match(page, /ownerOnboardEmailConflict|createOrg/);
    const detail = readFileSync(
      join(root, "src/agent/MerchantDetailCard.tsx"),
      "utf8",
    );
    assert.match(detail, /sites\/new/);
    assert.match(detail, /parentId=/);
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
    assert.match(page, /Open invoice/);
    assert.doesNotMatch(page, /generateSubAgentCommissionInvoices/);
    assert.doesNotMatch(page, /To sub-agents/);
    assert.doesNotMatch(page, /Issue invoices/);
    const payouts = readFileSync(
      join(root, "src/commercial/commissionPayoutRecords.ts"),
      "utf8",
    );
    assert.doesNotMatch(payouts, /generateSubAgentCommissionInvoices/);
    assert.doesNotMatch(payouts, /generate-sub/);
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

  it("wires Overview Profile activity gate + read-only owner (Phase G)", () => {
    const card = readFileSync(
      join(root, "src/agent/MerchantDetailCard.tsx"),
      "utf8",
    );
    assert.match(card, /AccountOverviewProfile/);
    assert.match(card, /setupKind=["']merchant["']/);
    assert.match(card, /canEditOrg=\{false\}/);
    assert.match(card, /canEditOwner=\{false\}/);
    assert.match(card, /listSettlement/);
    assert.match(card, /walletSet/);
    assert.doesNotMatch(card, /canSupportEdit=\{true\}/);
  });
});

describe("@paymentgate/web agent C3 sub-agent detail", () => {
  it("enriches Profile like merchant detail with activity gate (Phase G)", () => {
    const card = readFileSync(
      join(root, "src/agent/SubAgentDetailCard.tsx"),
      "utf8",
    );
    assert.match(card, /AccountOverviewProfile/);
    assert.match(card, /setupKind=["']agent["']/);
    assert.match(card, /canEditOrg=\{false\}/);
    assert.match(card, /canEditOwner=\{false\}/);
    assert.match(card, /getAgentPayout/);
    assert.match(card, /getAgentCommission/);
    assert.match(card, /walletSet/);
  });
});

describe("@paymentgate/web agent nested create removed", () => {
  it("redirects agents/* away from onboard and blocks agent_sub add-child", () => {
    const app = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.match(app, /path="agents\/new"/);
    assert.match(app, /Navigate to=\{agentRoute\("merchants"\)\}/);
    assert.doesNotMatch(app, /AgentSubAgentsRoutes|OnboardSubAgentPage/);

    const list = readFileSync(
      join(root, "src/agent/SubAgentsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /canCreateSubAgent = false/);
    assert.doesNotMatch(list, /agentRoute\("agents\/new"\)/);

    const prefetch = readFileSync(
      join(root, "src/agent/prefetchRoutes.ts"),
      "utf8",
    );
    assert.doesNotMatch(prefetch, /OnboardSubAgentPage|AgentSubAgentsRoutes/);
    assert.match(prefetch, /path === "agents"/);
    assert.match(prefetch, /AgentMerchantsRoutes/);

    const tree = readFileSync(
      join(root, "src/platform/platformOrgTree.ts"),
      "utf8",
    );
    assert.match(tree, /orgCanAddChild/);
    assert.match(tree, /org_type_disabled|Nested agent_sub create is disabled/);
    assert.doesNotMatch(
      tree,
      /type === "agent_sub" \|\|/,
    );
  });
});
