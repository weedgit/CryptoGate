import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("agent org list cache", () => {
  it("supports refresh, merge, and remove helpers", () => {
    const source = readFileSync(
      join(root, "../web/src/agent/agentOrgList.ts"),
      "utf8",
    );
    assert.match(source, /AGENT_ORGS_UPDATED_EVENT/);
    assert.match(source, /refreshAgentOrgList/);
    assert.match(source, /mergeAgentOrg/);
    assert.match(source, /removeAgentOrgFromList/);
  });
});

describe("parent agent list org users", () => {
  it("allows direct-child managers to list team on child orgs", () => {
    const routes = readFileSync(
      join(root, "src/orgs/membership-routes.mjs"),
      "utf8",
    );
    const block = routes.slice(
      routes.indexOf("export async function handleListOrgUsers"),
      routes.indexOf("export async function handleInviteOrgUser"),
    );
    assert.match(block, /canManageDirectChildOrg/);
    assert.match(block, /collectAncestorOrgIds/);
  });
});
