import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    assert.match(detail, /PlatformServiceBillDetailPage/);
    assert.match(detail, /AGENT_SERVICE_BILLS_PORTAL/);
    assert.doesNotMatch(detail, /issueServiceBill|markServiceBillPaid/);
    const shared = readFileSync(
      join(root, "src/platform/ServiceBillDetailPage.tsx"),
      "utf8",
    );
    assert.match(shared, /ServiceBillInvoiceFace/);
    assert.match(shared, /actionsOpen = !portal &&/);
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
    assert.match(app, /AgentAccountsRoutes/);
    const wizard = readFileSync(
      join(root, "src/agent/OnboardMerchantPage.tsx"),
      "utf8",
    );
    assert.match(wizard, /Onboard merchant/);
    assert.doesNotMatch(wizard, /New merchant/);
    assert.doesNotMatch(wizard, /stub UI/i);
    assert.match(wizard, /createOrg/);
    assert.match(wizard, /ownerOnboardEmailConflict/);
    assert.match(wizard, /inviteOwnerOrRollback/);
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
    assert.match(page, /plat-bills__panel--solo/);
    assert.match(page, /getCommissionPreview/);
    assert.match(page, /"Upcoming"/);
    assert.match(page, /canConfirm && toConfirm\[0\]/);
    assert.doesNotMatch(page, /issueServiceBill|createOrder|markCommissionPayoutsPaid/);
    const portal = readFileSync(
      join(root, "src/agent/useAgentCommissionsPortal.ts"),
      "utf8",
    );
    assert.match(portal, /kind: "agent"/);
    assert.match(portal, /payeeOrgId: primaryAgentOrgId\(session\)/);
    assert.match(portal, /readOnly: sessionIsAgentViewerOnly\(session\)/);
    assert.match(app, /CommissionInvoiceDetailPage/);
    assert.match(app, /commissions\/:id/);
    const payouts = readFileSync(
      join(root, "src/commercial/commissionPayoutRecords.ts"),
      "utf8",
    );
    assert.doesNotMatch(payouts, /generateSubAgentCommissionInvoices/);
    assert.doesNotMatch(payouts, /generate-sub/);
    assert.doesNotMatch(payouts, /paymentLinkForAgentSubPayout/);
    assert.doesNotMatch(payouts, /"ready"|"verifying"/);
  });
});

describe("@paymentgate/web agent C12 settings", () => {
  it("locks commission payout to USDT on Tron", () => {
    assert.equal(existsSync(join(root, "src/agent/AgentSettingsPage.tsx")), false);
    const page = readFileSync(
      join(root, "src/agent/AgentOrgEditHost.tsx"),
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
    assert.equal(existsSync(join(root, "src/agent/MerchantDetailPage.tsx")), false);
    const detail = readFileSync(
      join(root, "src/agent/MerchantDetailCard.tsx"),
      "utf8",
    );
    assert.match(detail, /id: "service-bills"/);
    assert.match(detail, /managed by merchant/i);
    assert.match(detail, /listServiceBillsPage\(\{/);
    assert.match(detail, /offset: \(billsPage - 1\) \* BILLS_PAGE_SIZE/);
    assert.match(detail, /OrgListPagination/);
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
  it("removes SubAgent detail card (Phase-1 purge)", () => {
    assert.equal(
      existsSync(join(root, "src/agent/SubAgentDetailCard.tsx")),
      false,
    );
    assert.equal(
      existsSync(join(root, "src/agent/SubAgentsListPage.tsx")),
      false,
    );
  });
});

describe("@paymentgate/web agent nested create removed", () => {
  it("redirects agents/* away and keeps agent_sub create gone", () => {
    const app = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.match(app, /path="agents\/\*"/);
    assert.match(app, /path="agents\/\*"\s*element=\{<Navigate to=\{agentRoute\("accounts"\)\}/);
    assert.doesNotMatch(app, /AgentSubAgentsRoutes|OnboardSubAgentPage|SubAgentsListPage/);

    assert.equal(
      existsSync(join(root, "src/agent/SubAgentsListPage.tsx")),
      false,
    );

    const prefetch = readFileSync(
      join(root, "src/agent/prefetchRoutes.ts"),
      "utf8",
    );
    assert.doesNotMatch(prefetch, /OnboardSubAgentPage|AgentSubAgentsRoutes|agents\//);

    const tree = readFileSync(
      join(root, "src/platform/platformOrgTree.ts"),
      "utf8",
    );
    assert.match(tree, /orgCanAddChild/);
    assert.doesNotMatch(tree, /agent_sub/);
    assert.doesNotMatch(tree, /canAddSubAgentUnderNode/);
  });
});
