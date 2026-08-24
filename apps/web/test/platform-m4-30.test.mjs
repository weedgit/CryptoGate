import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@cryptogate/web platform M4-30", () => {
  it("routes platform shell separately from merchant", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    assert.match(app, /\/platform\/\*/);
    assert.match(app, /PlatformApp/);
    assert.match(app, /\/merchant\/\*/);
  });

  it("wires service bill list and issue routes", () => {
    const platform = readFileSync(
      join(root, "src/platform/PlatformApp.tsx"),
      "utf8",
    );
    assert.match(platform, /service-bills/);
    assert.match(platform, /IssueServiceBillPage/);
    assert.match(platform, /RequirePlatformOperator/);
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

describe("@cryptogate/web platform B4 onboard agent", () => {
  it("wires wizard route and marks commercial step stub", () => {
    const app = readFileSync(join(root, "src/platform/PlatformApp.tsx"), "utf8");
    assert.match(app, /agents\/new/);
    assert.match(app, /OnboardAgentPage/);
    const wizard = readFileSync(
      join(root, "src/platform/OnboardAgentPage.tsx"),
      "utf8",
    );
    assert.match(wizard, /stub UI/i);
    assert.match(wizard, /createOrg/);
    assert.match(wizard, /inviteOrgUser/);
  });

  it("depth helper matches API default max agent depth", () => {
    const rules = readFileSync(
      join(root, "src/platform/onboardAgent.ts"),
      "utf8",
    );
    assert.match(rules, /DEFAULT_MAX_AGENT_DEPTH = 2/);
  });
});

describe("@cryptogate/web platform B10 B14 v0.3.2", () => {
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
    assert.match(list, /status-badge/);

    const detail = readFileSync(
      join(root, "src/platform/ServiceBillDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /ServiceBillActionsPanel/);
    assert.doesNotMatch(detail, /OpenAPI paths/);
  });
});

describe("@cryptogate/web platform B3 agent detail", () => {
  it("wires tabbed agent detail with subtree helpers", () => {
    const detail = readFileSync(
      join(root, "src/platform/AgentDetailPage.tsx"),
      "utf8",
    );
    assert.match(detail, /filter-tabs/);
    assert.match(detail, /merchantsInAgentSubtree/);
    assert.match(detail, /listAuditLog/);
    assert.match(detail, /service-bills/);
    assert.doesNotMatch(detail, /follow in a later/);

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
    assert.doesNotMatch(list, /B3.*follow-up/);
  });
});
