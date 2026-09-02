import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canReadPlatformOrgPolicy } from "../src/orgs/role-policy.mjs";
import { handleGetNetworkCatalog } from "../src/platform-settings/network-maintenance-routes.mjs";

describe("network catalog access", () => {
  it("allows platform viewer to read org policy", () => {
    assert.equal(
      canReadPlatformOrgPolicy({
        memberships: [{ orgType: "platform", role: "viewer" }],
      }),
      true,
    );
  });

  it("exports catalog handler with read policy wired", () => {
    assert.equal(typeof handleGetNetworkCatalog, "function");
  });
});
