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
  });

  it("does not expose payment order creation", () => {
    const agent = readFileSync(join(root, "src/agent/AgentApp.tsx"), "utf8");
    assert.doesNotMatch(agent, /createOrder/);
    assert.doesNotMatch(agent, /CreateOrderPage/);
  });
});
