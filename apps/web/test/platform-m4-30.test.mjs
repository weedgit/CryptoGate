import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web platform M4-30", () => {
  it("routes platform shell separately from merchant", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    assert.match(app, /\/platform\/\*/);
    assert.match(app, /PlatformApp/);
    assert.match(app, /lazyNamed/);
    assert.match(app, /\/merchant\/\*/);
  });

  it("wires service bill list and issue routes", () => {
    const platform = readFileSync(
      join(root, "src/platform/PlatformApp.tsx"),
      "utf8",
    );
    assert.match(platform, /service-bills\/new/);
    assert.match(platform, /issue=1/);
    const merchantsRoutes = readFileSync(
      join(root, "src/platform/PlatformMerchantsRoutes.tsx"),
      "utf8",
    );
    assert.match(merchantsRoutes, /RequirePlatformOperator/);
    const api = readFileSync(join(root, "src/platform/api.ts"), "utf8");
    assert.match(api, /issueServiceBill/);
    assert.match(api, /listServiceBills/);
  });

  it("does not merge payment orders with service bills UI", () => {
    const issue = readFileSync(
      join(root, "src/platform/IssueServiceBillPage.tsx"),
      "utf8",
    );
    assert.match(issue, /service bill/i);
    assert.doesNotMatch(issue, /createOrder/);
    assert.doesNotMatch(issue, /\/orders/);
  });
});

describe("@paymentgate/web platform B4 onboard agent", () => {
  it("wires wizard route and posts commercial commission", () => {
    const app = readFileSync(join(root, "src/platform/PlatformApp.tsx"), "utf8");
    assert.match(app, /agents\/new/);
    assert.match(app, /PlatformAgentsRoutes/);
    const wizard = readFileSync(
      join(root, "src/platform/OnboardAgentPage.tsx"),
      "utf8",
    );
    assert.match(wizard, /Onboard agent/);
    assert.doesNotMatch(wizard, /New agent/);
    assert.doesNotMatch(wizard, /stub UI/i);
    assert.match(wizard, /createOrg/);
    assert.match(wizard, /inviteOrgUser/);
    assert.match(wizard, /commissionPercent/);
  });

  it("depth helper matches API default max agent depth", () => {
    const rules = readFileSync(
      join(root, "src/platform/onboardAgent.ts"),
      "utf8",
    );
    assert.match(rules, /DEFAULT_MAX_AGENT_DEPTH = 2/);
  });
});

describe("@paymentgate/web platform B10 B14 v0.3.2", () => {
  it("wires bill PATCH actions and audit log to v0.3.2 API", () => {
    const api = readFileSync(join(root, "src/platform/api.ts"), "utf8");
    assert.match(api, /updateServiceBill/);
    assert.match(api, /listAuditLog/);
    assert.match(api, /method: "PATCH"/);

    const app = readFileSync(join(root, "src/platform/PlatformApp.tsx"), "utf8");
    assert.match(app, /ServiceBillDetailPage session=\{session\}/);
    assert.match(app, /AuditLogPage/);
    assert.match(app, /path="audit"/);

    const actions = readFileSync(
      join(root, "src/platform/ServiceBillActionsPanel.tsx"),
      "utf8",
    );
    assert.match(actions, /mark_paid/);
    assert.match(actions, /action: "void"/);
    assert.match(actions, /action: "adjust"/);

    const audit = readFileSync(join(root, "src/platform/AuditLogPage.tsx"), "utf8");
    assert.match(audit, /listAuditLog/);
    assert.match(audit, /service_bill_mark_paid/);
  });

  it("uses shared service bill status badges on list and detail", () => {
    const list = readFileSync(
      join(root, "src/platform/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /serviceBillStatusTone/);
    assert.match(list, /plat-bills__badge/);

    const detail = readFileSync(
      join(root, "src/platform/ServiceBillDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /ServiceBillActionsPanel/);
    assert.doesNotMatch(detail, /OpenAPI paths/);
  });
});

describe("@paymentgate/web platform B3 agent detail", () => {
  it("wires tabbed agent detail with subtree helpers", () => {
    const detail = readFileSync(
      join(root, "src/platform/AgentDetailCard.tsx"),
      "utf8",
    );
    assert.match(detail, /merchantsInAgentSubtree/);
    assert.match(detail, /service-bills/);

    const subtree = readFileSync(
      join(root, "src/platform/agentSubtree.ts"),
      "utf8",
    );
    assert.match(subtree, /merchantsInAgentSubtree/);
    assert.match(subtree, /isOrgUnderAgent/);

    const list = readFileSync(
      join(root, "src/platform/AgentsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /AgentDetailCard/);
    assert.doesNotMatch(list, /B3.*follow-up/);
  });
});

describe("@paymentgate/web platform B6 merchant detail", () => {
  it("wires merchant detail route and tabbed read-only views", () => {
    const app = readFileSync(join(root, "src/platform/PlatformApp.tsx"), "utf8");
    assert.match(app, /merchants\/:id/);
    assert.match(app, /PlatformMerchantsRoutes/);

    const detail = readFileSync(
      join(root, "src/platform/MerchantDetailCard.tsx"),
      "utf8",
    );
    assert.match(detail, /listSettlement/);
    assert.match(detail, /getMatchingMode/);
    assert.match(detail, /Read-only on platform/);

    const list = readFileSync(
      join(root, "src/platform/MerchantsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /MerchantDetailCard/);
    assert.match(list, /platformRoute\(`merchants\/\$\{id\}`\)/);
  });
});

describe("@paymentgate/web platform B8 B13 v0.3.3", () => {
  it("wires fee tiers and org policy settings to X-01 API", () => {
    const api = readFileSync(join(root, "src/platform/api.ts"), "utf8");
    assert.match(api, /getFeeTierSettings/);
    assert.match(api, /updatePlatformOrgPolicy/);
    assert.match(api, /decideEnterpriseRateApproval/);

    const app = readFileSync(join(root, "src/platform/PlatformApp.tsx"), "utf8");
    assert.match(app, /settings\/fee-tiers/);
    assert.match(app, /settings\/security/);
    assert.match(app, /Navigate to=\{platformRoute\(\)\}/);

    const shell = readFileSync(
      join(root, "src/platform/PlatformShell.tsx"),
      "utf8",
    );
    assert.match(shell, /SidebarProfileMenu/);
    assert.doesNotMatch(shell, /label: "Profile"/);
    assert.doesNotMatch(shell, /label: "Settings"/);

    const b8 = readFileSync(
      join(root, "src/platform/FeeTiersSettingsPage.tsx"),
      "utf8",
    );
    assert.match(b8, /next billing period/i);
    assert.match(b8, /Custom merchant rate overrides/i);
    assert.match(b8, /Platform fees/);

    const profile = readFileSync(
      join(root, "src/auth/SecuritySettingsPage.tsx"),
      "utf8",
    );
    assert.match(profile, /Require two-step verification|mfaEnforcement/);
    assert.match(profile, /sessionTimeoutMinutes|Session timeout/i);
    assert.match(profile, /Profile/);

    const menu = readFileSync(
      join(root, "src/auth/SidebarProfileMenu.tsx"),
      "utf8",
    );
    assert.match(menu, /Profile/);
    assert.match(menu, /Sign out/);
  });

  it("treats 401 mfa_required as step-up, not signed-out", () => {
    const app = readFileSync(join(root, "src/platform/PlatformApp.tsx"), "utf8");
    assert.match(app, /usePortalBoot/);
    assert.match(app, /startOnMfa=\{mfaPending\}/);
    const boot = readFileSync(join(root, "src/auth/usePortalBoot.ts"), "utf8");
    assert.match(boot, /loadPortalSession/);
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /mfa_required/);
  });
});
