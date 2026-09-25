import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web phase1 agent list / architecture", () => {
  it("agents list has no Type or Parent columns", () => {
    const page = readFileSync(
      join(root, "src/platform/AgentsListPage.tsx"),
      "utf8",
    );
    assert.doesNotMatch(page, /label=\"Type\"/);
    assert.doesNotMatch(page, /label=\"Parent\"/);
    assert.doesNotMatch(page, /org-agents__col-type/);
    assert.doesNotMatch(page, /org-agents__col-parent/);
    assert.match(page, /label=\"Merchants\"/);
    assert.match(page, /label=\"Payout\"/);
  });

  it("architecture detail omits agent Depth meta", () => {
    const platform = readFileSync(
      join(root, "src/platform/ArchitecturePage.tsx"),
      "utf8",
    );
    const agent = readFileSync(
      join(root, "src/agent/ArchitecturePage.tsx"),
      "utf8",
    );
    assert.doesNotMatch(platform, /label=\"Depth\"/);
    assert.doesNotMatch(agent, /label=\"Depth\"/);
    assert.doesNotMatch(platform, /agentDepthOfNode/);
    assert.doesNotMatch(agent, /agentDepthOfNode/);
  });
});
