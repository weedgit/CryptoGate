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
